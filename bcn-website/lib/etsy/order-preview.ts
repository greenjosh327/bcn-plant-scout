import type { SupabaseServiceClient } from "@/lib/admin-api";
import { getEtsyReceiptTransactionsRead, getEtsyShopReceiptsPageRead } from "./client";
import { ETSY_CONNECTION_ID, ETSY_ORDER_READ_SCOPE } from "./config";
import { isConnectedEtsyRow, loadEtsyConnection } from "./connection-store";
import {
  BLACK_CHERRY_PRODUCT_ID,
  normalizeEtsyReceiptForStorage,
  normalizeEtsyTransactionForStorage
} from "./order-sync-core";
import type { EtsyReceipt, EtsyReceiptTransaction } from "./types";

const PREVIEW_WINDOW_HOURS = 72;
const RECEIPT_PAGE_SIZE = 100;
const MAX_PREVIEW_RECEIPTS = 300;

type PreviewListingMappingRow = {
  id: number;
  listing_id: number;
  bcn_product_id: string;
};

type PreviewVariationMappingRow = {
  listing_mapping_id: number;
  etsy_product_id: number;
  sku: string | null;
  variation_fingerprint: string;
  packs_consumed: 1 | 4;
};

type PreviewProductRow = {
  id: string;
  common_name: string | null;
  scientific_name: string | null;
};

export type EtsyPreviewMapping = {
  listingId: number;
  etsyProductId: number;
  sku: string | null;
  variationFingerprint: string;
  bcnProductId: string;
  bcnProductName: string;
  packsConsumed: 1 | 4;
};

export type EtsyTransactionPreviewCandidate = {
  receiptId: number;
  transactionId: number;
  paidAtUtc: string;
  paidAtEastern: string;
  listingId: number;
  etsyProductId: number | null;
  sku: string | null;
  variations: Array<{ propertyId: number; name: string; value: string }>;
  variationLabel: string;
  quantityPurchased: number;
  receiptStatus: string;
  isCancelled: boolean;
  isRefunded: boolean;
  exactConfirmedMapping: boolean;
  matchedBcnProduct: string | null;
  matchedBcnProductId: string | null;
  confirmedPackMultiplier: 1 | 4 | null;
  expectedPhysicalPackImpact: number | null;
};

export type EtsyTransactionPreview = {
  listingIdFilter: number;
  windowStartedAt: string;
  windowEndedAt: string;
  truncated: boolean;
  candidates: EtsyTransactionPreviewCandidate[];
};

export class EtsyTransactionPreviewError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function normalizedReceiptStatus(receipt: ReturnType<typeof normalizeEtsyReceiptForStorage>) {
  if (receipt.status) return receipt.status;
  if (receipt.is_canceled) return "canceled";
  return receipt.is_paid ? "paid" : "unpaid";
}

export function formatEasternTimestamp(isoTimestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short"
  }).format(new Date(isoTimestamp));
}

export function buildEtsyTransactionPreviewCandidate(
  rawReceipt: EtsyReceipt,
  rawTransaction: EtsyReceiptTransaction,
  mappings: EtsyPreviewMapping[]
) {
  const receipt = normalizeEtsyReceiptForStorage(rawReceipt);
  const transaction = normalizeEtsyTransactionForStorage(rawTransaction);
  if (!receipt.is_paid || !transaction.paid_at || transaction.listing_id === null) return null;

  const matching = mappings.filter((mapping) =>
    mapping.bcnProductId !== BLACK_CHERRY_PRODUCT_ID &&
    mapping.listingId === transaction.listing_id &&
    transaction.product_id !== null && mapping.etsyProductId === transaction.product_id &&
    (mapping.sku || "") === (transaction.sku || "") &&
    mapping.variationFingerprint === transaction.variation_fingerprint
  );
  const mapping = matching.length === 1 ? matching[0] : null;

  return {
    receiptId: receipt.receipt_id,
    transactionId: transaction.transaction_id,
    paidAtUtc: transaction.paid_at,
    paidAtEastern: formatEasternTimestamp(transaction.paid_at),
    listingId: transaction.listing_id,
    etsyProductId: transaction.product_id,
    sku: transaction.sku,
    variations: transaction.variations,
    variationLabel: transaction.variation_label,
    quantityPurchased: transaction.quantity,
    receiptStatus: normalizedReceiptStatus(receipt),
    isCancelled: receipt.is_canceled,
    isRefunded: receipt.has_refund,
    exactConfirmedMapping: Boolean(mapping),
    matchedBcnProduct: mapping?.bcnProductName || null,
    matchedBcnProductId: mapping?.bcnProductId || null,
    confirmedPackMultiplier: mapping?.packsConsumed || null,
    expectedPhysicalPackImpact: mapping ? transaction.quantity * mapping.packsConsumed : null
  } satisfies EtsyTransactionPreviewCandidate;
}

async function loadConfirmedPreviewMappings(
  supabase: SupabaseServiceClient,
  shopId: number,
  listingId: number
) {
  const { data: listingData, error: listingError } = await supabase
    .from("etsy_listing_mappings")
    .select("id, listing_id, bcn_product_id")
    .eq("connection_id", ETSY_CONNECTION_ID)
    .eq("shop_id", shopId)
    .eq("listing_id", listingId)
    .eq("status", "confirmed")
    .not("bcn_product_id", "is", null);
  if (listingError) throw new EtsyTransactionPreviewError(500, "Confirmed Etsy mappings could not be read.");

  const listings = (listingData || []) as PreviewListingMappingRow[];
  if (listings.length === 0) return [];

  const listingIds = listings.map((mapping) => mapping.id);
  const productIds = [...new Set(listings.map((mapping) => mapping.bcn_product_id))];
  const [variationResult, productResult] = await Promise.all([
    supabase
      .from("etsy_variation_mappings")
      .select("listing_mapping_id, etsy_product_id, sku, variation_fingerprint, packs_consumed")
      .in("listing_mapping_id", listingIds)
      .eq("status", "confirmed")
      .in("packs_consumed", [1, 4]),
    supabase
      .from("products")
      .select("id, common_name, scientific_name")
      .in("id", productIds)
  ]);
  if (variationResult.error || productResult.error) {
    throw new EtsyTransactionPreviewError(500, "Confirmed Etsy mapping details could not be read.");
  }

  const variations = (variationResult.data || []) as PreviewVariationMappingRow[];
  const products = (productResult.data || []) as PreviewProductRow[];
  const productById = new Map(products.map((product) => [
    product.id,
    product.common_name?.trim() || product.scientific_name?.trim() || product.id
  ]));
  const listingById = new Map(listings.map((mapping) => [mapping.id, mapping]));

  return variations.flatMap((variation) => {
    const listing = listingById.get(variation.listing_mapping_id);
    if (!listing || !productById.has(listing.bcn_product_id)) return [];
    return [{
      listingId: listing.listing_id,
      etsyProductId: variation.etsy_product_id,
      sku: variation.sku,
      variationFingerprint: variation.variation_fingerprint,
      bcnProductId: listing.bcn_product_id,
      bcnProductName: productById.get(listing.bcn_product_id)!,
      packsConsumed: variation.packs_consumed
    } satisfies EtsyPreviewMapping];
  });
}

function unixSeconds(date: Date) {
  const value = Math.floor(date.getTime() / 1000);
  if (!Number.isSafeInteger(value) || value < 946684800) {
    throw new EtsyTransactionPreviewError(400, "The transaction preview time window is invalid.");
  }
  return value;
}

export async function getEtsyTransactionPreview(
  supabase: SupabaseServiceClient,
  listingId: number,
  now = new Date()
): Promise<EtsyTransactionPreview> {
  if (!Number.isSafeInteger(listingId) || listingId <= 0) {
    throw new EtsyTransactionPreviewError(400, "A valid Etsy listing ID is required.");
  }

  const connection = await loadEtsyConnection(supabase);
  if (!isConnectedEtsyRow(connection)) {
    throw new EtsyTransactionPreviewError(409, "Etsy is not connected.");
  }
  if (!connection.granted_scopes?.includes(ETSY_ORDER_READ_SCOPE)) {
    throw new EtsyTransactionPreviewError(409, "Reconnect Etsy to grant transactions_r before previewing transactions.");
  }

  const windowEndedAt = new Date(now);
  const windowStartedAt = new Date(windowEndedAt.getTime() - PREVIEW_WINDOW_HOURS * 60 * 60 * 1000);
  const minimum = unixSeconds(windowStartedAt);
  const maximum = unixSeconds(windowEndedAt);
  const mappings = await loadConfirmedPreviewMappings(supabase, connection.shop_id, listingId);
  const candidates: EtsyTransactionPreviewCandidate[] = [];
  let receiptsRead = 0;
  let truncated = false;

  for (let offset = 0; offset < MAX_PREVIEW_RECEIPTS; offset += RECEIPT_PAGE_SIZE) {
    const receiptRead = await getEtsyShopReceiptsPageRead(supabase, {
      shopId: connection.shop_id,
      minLastModified: minimum,
      maxLastModified: maximum,
      offset,
      limit: RECEIPT_PAGE_SIZE,
      wasPaid: true
    });
    console.info("Etsy transaction preview GET", { endpoint: receiptRead.endpoint, status: receiptRead.status });
    const receipts = Array.isArray(receiptRead.data.results) ? receiptRead.data.results : [];
    receiptsRead += receipts.length;

    for (const receipt of receipts) {
      const normalizedReceipt = normalizeEtsyReceiptForStorage(receipt);
      if (!normalizedReceipt.is_paid) continue;
      const transactionRead = await getEtsyReceiptTransactionsRead(
        supabase,
        connection.shop_id,
        normalizedReceipt.receipt_id
      );
      console.info("Etsy transaction preview GET", {
        endpoint: transactionRead.endpoint,
        status: transactionRead.status
      });

      for (const transaction of transactionRead.data.results || []) {
        const candidate = buildEtsyTransactionPreviewCandidate(receipt, transaction, mappings);
        if (
          candidate &&
          candidate.listingId === listingId &&
          candidate.paidAtUtc >= windowStartedAt.toISOString() &&
          candidate.paidAtUtc <= windowEndedAt.toISOString()
        ) {
          candidates.push(candidate);
        }
      }
    }

    if (receipts.length < RECEIPT_PAGE_SIZE || receiptsRead >= Number(receiptRead.data.count || 0)) break;
    if (offset + RECEIPT_PAGE_SIZE >= MAX_PREVIEW_RECEIPTS) truncated = true;
  }

  candidates.sort((left, right) => right.paidAtUtc.localeCompare(left.paidAtUtc));
  return {
    listingIdFilter: listingId,
    windowStartedAt: windowStartedAt.toISOString(),
    windowEndedAt: windowEndedAt.toISOString(),
    truncated,
    candidates
  };
}
