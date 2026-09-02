import { randomUUID } from "node:crypto";
import type { SupabaseServiceClient } from "@/lib/admin-api";
import { getEtsyReceiptTransactions, getEtsyShopReceiptsPage } from "./client";
import { ETSY_CONNECTION_ID, ETSY_ORDER_READ_SCOPE, etsyOrderSyncEnabled } from "./config";
import { isConnectedEtsyRow, loadEtsyConnection } from "./connection-store";
import { MANAGED_SEED_SPECIES } from "./inventory-allocation";
import { generateEtsyInventoryProposal } from "./inventory-proposals";
import { normalizeEtsyReceiptForStorage, normalizeEtsyTransactionForStorage } from "./order-sync-core";

const RECEIPT_PAGE_SIZE = 100;
const SYNC_SETTLE_DELAY_MS = 30_000;

type SyncCounters = {
  paid_receipts_found: number;
  transactions_found: number;
  matched_transactions: number;
  manual_review_transactions: number;
  ignored_transactions: number;
  duplicate_transactions: number;
  physical_packs_decremented: number;
};

type BeginSyncResult = {
  run_id: string;
  lease_token: string;
  window_started_at: string;
  window_ended_at: string;
  status: string;
  reused: boolean;
};

type ReceiptProcessResult = {
  new_paid_receipt: boolean;
  transactions_found: number;
  matched_transactions: number;
  manual_review_transactions: number;
  ignored_transactions: number;
  duplicate_transactions: number;
  physical_packs_decremented: number;
};

function hasOrderReadScope(scopes: string[] | null | undefined) {
  return Boolean(scopes?.includes(ETSY_ORDER_READ_SCOPE));
}

function safeErrorMessage(error: unknown) {
  return (error instanceof Error ? error.message : "Unknown Etsy order-sync error")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b\d+\.[A-Za-z0-9_-]{16,}\b/g, "[redacted]")
    .slice(0, 500);
}

function unixSeconds(value: string) {
  const milliseconds = new Date(value).getTime();
  if (!Number.isFinite(milliseconds)) throw new Error("The Etsy order-sync window timestamp is invalid.");
  return Math.max(946684800, Math.floor(milliseconds / 1000));
}

function emptyCounters(): SyncCounters {
  return {
    paid_receipts_found: 0,
    transactions_found: 0,
    matched_transactions: 0,
    manual_review_transactions: 0,
    ignored_transactions: 0,
    duplicate_transactions: 0,
    physical_packs_decremented: 0
  };
}

function addReceiptResult(counters: SyncCounters, result: ReceiptProcessResult) {
  if (result.new_paid_receipt) counters.paid_receipts_found += 1;
  counters.transactions_found += Number(result.transactions_found) || 0;
  counters.matched_transactions += Number(result.matched_transactions) || 0;
  counters.manual_review_transactions += Number(result.manual_review_transactions) || 0;
  counters.ignored_transactions += Number(result.ignored_transactions) || 0;
  counters.duplicate_transactions += Number(result.duplicate_transactions) || 0;
  counters.physical_packs_decremented += Number(result.physical_packs_decremented) || 0;
}

export async function initializeEtsyOrderSyncBaseline(
  supabase: SupabaseServiceClient,
  adminUserId: string,
  baselineAt = new Date().toISOString()
) {
  const connection = await loadEtsyConnection(supabase);
  if (!isConnectedEtsyRow(connection)) throw new Error("Etsy must be connected before initializing order sync.");
  if (!hasOrderReadScope(connection.granted_scopes)) {
    throw new Error("Reconnect Etsy and grant transactions_r before initializing the order-sync baseline.");
  }

  const { data, error } = await supabase.rpc("initialize_etsy_order_sync_baseline", {
    p_connection_id: ETSY_CONNECTION_ID,
    p_admin_user_id: adminUserId,
    p_baseline_at: baselineAt
  });
  if (error) throw new Error(`Could not initialize the Etsy order-sync baseline: ${error.message}`);
  return data;
}

export async function getEtsyOrderSyncStatus(supabase: SupabaseServiceClient) {
  const connection = await loadEtsyConnection(supabase);
  const connected = isConnectedEtsyRow(connection);
  const productIds = MANAGED_SEED_SPECIES.map((species) => species.productId);

  const [stateResult, runResult, reviewResult, inventoryResult] = await Promise.all([
    supabase
      .from("etsy_order_sync_state")
      .select("baseline_at, baseline_initialized_at, cursor_updated_at, last_attempt_at, last_successful_sync_at, active_run_id, lease_expires_at, last_error")
      .eq("connection_id", ETSY_CONNECTION_ID)
      .maybeSingle(),
    supabase
      .from("etsy_order_sync_runs")
      .select("id, status, window_started_at, window_ended_at, paid_receipts_found, transactions_found, matched_transactions, manual_review_transactions, ignored_transactions, duplicate_transactions, physical_packs_decremented, reconciliation_proposal_id, error_summary, started_at, completed_at")
      .eq("connection_id", ETSY_CONNECTION_ID)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("etsy_transactions")
      .select("transaction_id, receipt_id, listing_id, sku, variation_label, quantity_purchased, bcn_product_id, physical_packs_consumed, processing_status, review_reason, last_seen_at")
      .in("processing_status", [
        "manual_review_unmatched",
        "manual_review_blocked",
        "manual_review_refund",
        "manual_review_insufficient_stock",
        "manual_review_post_processing_change"
      ])
      .order("last_seen_at", { ascending: false })
      .limit(50),
    supabase
      .from("products")
      .select("id, inventory, updated_at")
      .in("id", productIds)
  ]);

  for (const result of [stateResult, runResult, reviewResult, inventoryResult]) {
    if (result.error) throw new Error(`Could not load Etsy order-sync status: ${result.error.message}`);
  }

  const speciesById = new Map(MANAGED_SEED_SPECIES.map((species) => [species.productId, species.species]));
  return {
    connected,
    orderReadScopeGranted: hasOrderReadScope(connection?.granted_scopes),
    orderSyncEnabled: etsyOrderSyncEnabled(),
    baseline: stateResult.data,
    lastRun: runResult.data,
    manualReview: (reviewResult.data || []).map((row) => ({
      ...row,
      species: row.bcn_product_id ? speciesById.get(row.bcn_product_id) || "Mapped product" : "Unmatched"
    })),
    physicalInventory: MANAGED_SEED_SPECIES.map((species) => {
      const row = (inventoryResult.data || []).find((product) => product.id === species.productId);
      return {
        productId: species.productId,
        species: species.species,
        physicalPacks: Number(row?.inventory) || 0,
        totalSeeds: (Number(row?.inventory) || 0) * 25,
        updatedAt: row?.updated_at || null,
        blocked: Boolean(species.blockedFromWrites)
      };
    })
  };
}

export async function syncEtsyOrders(
  supabase: SupabaseServiceClient,
  adminUserId: string,
  clientRequestId: string = randomUUID()
) {
  if (!etsyOrderSyncEnabled()) throw new Error("Etsy order sync is disabled by the production safety flag.");

  const connection = await loadEtsyConnection(supabase);
  if (!isConnectedEtsyRow(connection)) throw new Error("Etsy must be connected before syncing orders.");
  if (!hasOrderReadScope(connection.granted_scopes)) {
    throw new Error("Reconnect Etsy and grant transactions_r before syncing orders.");
  }

  const windowEndedAt = new Date(Date.now() - SYNC_SETTLE_DELAY_MS).toISOString();
  let activeRun: BeginSyncResult | null = null;

  try {
    const { data: beginData, error: beginError } = await supabase.rpc("begin_etsy_order_sync", {
      p_connection_id: ETSY_CONNECTION_ID,
      p_admin_user_id: adminUserId,
      p_client_request_id: clientRequestId,
      p_window_ended_at: windowEndedAt
    });
    if (beginError || !beginData) throw new Error(beginError?.message || "The Etsy order-sync run could not start.");
    activeRun = beginData as BeginSyncResult;

    if (activeRun.reused && activeRun.status !== "running") {
      return getEtsyOrderSyncStatus(supabase);
    }

    const counters = emptyCounters();
    const minimum = unixSeconds(activeRun.window_started_at);
    const maximum = unixSeconds(activeRun.window_ended_at);

    for (let offset = 0; ; offset += RECEIPT_PAGE_SIZE) {
      const page = await getEtsyShopReceiptsPage(supabase, {
        shopId: connection.shop_id,
        minLastModified: minimum,
        maxLastModified: maximum,
        offset,
        limit: RECEIPT_PAGE_SIZE
      });
      const receipts = Array.isArray(page.results) ? page.results : [];

      for (const rawReceipt of receipts) {
        const receipt = normalizeEtsyReceiptForStorage(rawReceipt);
        const transactionPage = await getEtsyReceiptTransactions(supabase, connection.shop_id, receipt.receipt_id);
        const transactions = (transactionPage.results || []).map(normalizeEtsyTransactionForStorage);

        const { data: processData, error: processError } = await supabase.rpc("process_etsy_order_receipt", {
          p_run_id: activeRun.run_id,
          p_lease_token: activeRun.lease_token,
          p_connection_id: ETSY_CONNECTION_ID,
          p_shop_id: connection.shop_id,
          p_receipt: receipt,
          p_transactions: transactions
        });
        if (processError || !processData) {
          throw new Error(processError?.message || `Etsy receipt ${receipt.receipt_id} could not be processed.`);
        }
        addReceiptResult(counters, processData as ReceiptProcessResult);
      }

      if (receipts.length < RECEIPT_PAGE_SIZE || offset + receipts.length >= Number(page.count || 0)) break;
    }

    let proposalId: string | null = null;
    let completionStatus: "completed" | "completed_with_review" | "reconciliation_failed" =
      counters.manual_review_transactions > 0 ? "completed_with_review" : "completed";
    let reconciliationError: string | null = null;

    if (counters.matched_transactions > 0) {
      try {
        const { data: blockedRows, error: blockedError } = await supabase
          .from("etsy_transactions")
          .select("bcn_product_id")
          .eq("connection_id", ETSY_CONNECTION_ID)
          .eq("processing_status", "manual_review_insufficient_stock");
        if (blockedError) throw blockedError;
        const blockedProductIds = [...new Set((blockedRows || []).flatMap((row) => row.bcn_product_id || []))];
        const proposal = await generateEtsyInventoryProposal(supabase, adminUserId, {
          idempotencyKey: `etsy-order-sync:${activeRun.run_id}`,
          blockedProductIds
        });
        proposalId = proposal.proposalId;
      } catch (error) {
        completionStatus = "reconciliation_failed";
        reconciliationError = safeErrorMessage(error);
      }
    }

    const { error: finishError } = await supabase.rpc("finish_etsy_order_sync", {
      p_run_id: activeRun.run_id,
      p_lease_token: activeRun.lease_token,
      p_status: completionStatus,
      p_counts: counters,
      p_reconciliation_proposal_id: proposalId,
      p_error_summary: reconciliationError
    });
    if (finishError) throw new Error(`Could not finalize the Etsy order sync: ${finishError.message}`);

    return getEtsyOrderSyncStatus(supabase);
  } catch (error) {
    if (activeRun?.run_id && activeRun.lease_token) {
      const message = safeErrorMessage(error);
      const { error: failError } = await supabase.rpc("fail_etsy_order_sync", {
        p_run_id: activeRun.run_id,
        p_lease_token: activeRun.lease_token,
        p_error_summary: message
      });
      if (failError) console.error("Etsy order-sync failure state could not be saved", { message: failError.message });
    }
    throw error;
  }
}
