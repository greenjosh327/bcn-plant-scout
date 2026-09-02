import type { SupabaseServiceClient } from "@/lib/admin-api";
import {
  getEtsyListingInventory,
  getEtsyListingInventoryRead,
  normalizeEtsyListingInventory,
  EtsyHttpError,
  type EtsyReadResult
} from "./client";
import {
  ETSY_CONNECTION_ID,
  ETSY_INVENTORY_WRITE_SCOPE,
  etsyInventoryWritesEnabled
} from "./config";
import { findManagedSpeciesByProductId, variationFingerprint } from "./inventory-allocation";
import {
  EtsyInventoryWriteError,
  buildEtsyInventoryUpdatePayload,
  inventoryOfferingKey,
  updateEtsyListingInventory,
  type EtsyInventoryUpdateResult
} from "./inventory-writer";
import type { EtsyListingInventory } from "./types";

type ChangeSetRow = {
  id: string;
  admin_user_id: string;
  status: "proposed" | "applying" | "completed" | "partial" | "failed" | "stale" | "cancelled";
  expires_at: string;
  approved_at: string | null;
  completed_at: string | null;
  error_summary: string | null;
};

type ChangeItemRow = {
  id: number;
  listing_mapping_id: number | null;
  variation_mapping_id: number | null;
  bcn_product_id: string | null;
  species: string | null;
  listing_id: number;
  listing_title: string;
  etsy_product_id: number;
  etsy_offering_id: number;
  sku: string | null;
  variation_name: string;
  packs_consumed: number | null;
  before_quantity: number;
  proposed_quantity: number;
  proposed_pack_commitment: number | null;
  physical_pack_inventory: number | null;
  result_status: "proposed" | "no_change" | "blocked" | "succeeded" | "failed" | "skipped" | "unknown";
  put_endpoint: string | null;
  put_http_status: number | null;
  put_response: unknown;
  readback_endpoint: string | null;
  readback_http_status: number | null;
  readback_quantities: unknown;
  readback_at: string | null;
  verified_quantity: number | null;
  verified_at: string | null;
  attempted_at: string | null;
  completed_at: string | null;
};

type VerificationExpectedItem = Pick<
  ChangeItemRow,
  "etsy_product_id" | "etsy_offering_id" | "proposed_quantity"
>;

export type EtsyReadbackQuantity = {
  productId: number;
  offeringId: number;
  sku: string | null;
  quantity: number;
};

export function etsyReadbackQuantities(inventory: EtsyListingInventory): EtsyReadbackQuantity[] {
  return normalizeEtsyListingInventory(inventory).offerings.map((offering) => ({
    productId: offering.productId,
    offeringId: offering.offeringId,
    sku: offering.sku,
    quantity: offering.quantity
  }));
}

export function verifyEtsyInventoryReadback(
  inventory: EtsyListingInventory,
  items: VerificationExpectedItem[]
) {
  const quantities = etsyReadbackQuantities(inventory);
  const verified = items.map((item) => {
    const offering = quantities.find(
      (candidate) =>
        candidate.productId === item.etsy_product_id && candidate.offeringId === item.etsy_offering_id
    );
    return {
      productId: item.etsy_product_id,
      offeringId: item.etsy_offering_id,
      expectedQuantity: item.proposed_quantity,
      actualQuantity: offering?.quantity ?? null,
      matches: offering?.quantity === item.proposed_quantity
    };
  });

  return { matches: verified.every((item) => item.matches), quantities, verified };
}

export function changeSetMeetsCompletionInvariant(
  items: Array<
    Pick<
      ChangeItemRow,
      "before_quantity" | "proposed_quantity" | "result_status" | "verified_quantity" | "verified_at"
    >
  >
) {
  const changedItems = items.filter((item) => item.before_quantity !== item.proposed_quantity);
  return changedItems.length > 0 && changedItems.every(
    (item) =>
      item.result_status === "succeeded" &&
      item.verified_quantity === item.proposed_quantity &&
      Boolean(item.verified_at)
  );
}

export async function putThenReadBackEtsyInventory(
  items: VerificationExpectedItem[],
  put: () => Promise<EtsyInventoryUpdateResult>,
  read: () => Promise<EtsyReadResult<EtsyListingInventory>>,
  recordPut: (result: EtsyInventoryUpdateResult) => Promise<void> = async () => undefined
) {
  const putResult = await put();
  await recordPut(putResult);
  const readback = await read();
  return {
    putResult,
    readback,
    verification: verifyEtsyInventoryReadback(readback.data, items)
  };
}

function safeErrorMessage(error: unknown) {
  if (error instanceof EtsyInventoryWriteError || error instanceof EtsyHttpError) return error.safeMessage;
  const message = error instanceof Error ? error.message : "Unknown inventory update error.";
  return message.replace(/\bBearer\s+\S+/gi, "Bearer [redacted]").slice(0, 500);
}

async function loadChangeSet(supabase: SupabaseServiceClient, proposalId: string, adminUserId: string) {
  const { data: changeSet, error: changeSetError } = await supabase
    .from("etsy_inventory_change_sets")
    .select("id, admin_user_id, status, expires_at, approved_at, completed_at, error_summary")
    .eq("id", proposalId)
    .eq("admin_user_id", adminUserId)
    .maybeSingle();
  if (changeSetError) throw new Error(`Could not load the Etsy proposal: ${changeSetError.message}`);
  if (!changeSet) throw new Error("The Etsy inventory proposal was not found.");

  const { data: items, error: itemsError } = await supabase
    .from("etsy_inventory_change_items")
    .select(
      "id, listing_mapping_id, variation_mapping_id, bcn_product_id, species, listing_id, listing_title, etsy_product_id, etsy_offering_id, sku, variation_name, packs_consumed, before_quantity, proposed_quantity, proposed_pack_commitment, physical_pack_inventory, result_status, put_endpoint, put_http_status, put_response, readback_endpoint, readback_http_status, readback_quantities, readback_at, verified_quantity, verified_at, attempted_at, completed_at"
    )
    .eq("change_set_id", proposalId)
    .order("listing_id")
    .order("id");
  if (itemsError) throw new Error(`Could not load Etsy proposal items: ${itemsError.message}`);
  return { changeSet: changeSet as ChangeSetRow, items: (items as ChangeItemRow[] | null) || [] };
}

async function markChangeSet(
  supabase: SupabaseServiceClient,
  proposalId: string,
  values: Record<string, unknown>
) {
  const { error } = await supabase.from("etsy_inventory_change_sets").update(values).eq("id", proposalId);
  if (error) throw new Error(`Could not update the Etsy proposal audit record: ${error.message}`);
}

async function markItems(
  supabase: SupabaseServiceClient,
  itemIds: number[],
  values: Record<string, unknown>
) {
  if (itemIds.length === 0) return;
  const { error } = await supabase.from("etsy_inventory_change_items").update(values).in("id", itemIds);
  if (error) throw new Error(`Could not update Etsy proposal item audit records: ${error.message}`);
}

async function validateProposalState(supabase: SupabaseServiceClient, items: ChangeItemRow[]) {
  const actionable = items.filter((item) => item.result_status === "proposed");
  const mappedItems = items.filter((item) => item.result_status === "proposed" || item.result_status === "no_change");
  if (actionable.length === 0) throw new Error("This proposal contains no approved quantity changes.");
  if (mappedItems.some((item) => !item.listing_mapping_id || !item.variation_mapping_id || !item.bcn_product_id)) {
    throw new Error("An unmatched Etsy item was included in the proposed writes.");
  }
  if (actionable.some((item) => findManagedSpeciesByProductId(item.bcn_product_id)?.blockedFromWrites)) {
    throw new Error("Black Cherry remains blocked from Etsy inventory writes.");
  }

  const productIds = [...new Set(actionable.map((item) => item.bcn_product_id!))];
  const { data: products, error: productError } = await supabase
    .from("products")
    .select("id, inventory")
    .in("id", productIds);
  if (productError) throw new Error(`Could not revalidate BCN physical inventory: ${productError.message}`);
  const physicalByProduct = new Map((products || []).map((product) => [product.id, Number(product.inventory)]));

  for (const productId of productIds) {
    const productItems = items.filter(
      (item) => item.bcn_product_id === productId && (item.result_status === "proposed" || item.result_status === "no_change")
    );
    const snapshot = productItems[0]?.physical_pack_inventory;
    const currentPhysical = physicalByProduct.get(productId);
    if (snapshot === null || currentPhysical === undefined || currentPhysical !== snapshot) {
      throw new Error("BCN physical inventory changed after this proposal was generated.");
    }
    const proposedCommitment = productItems.reduce(
      (total, item) => total + Number(item.proposed_pack_commitment || 0),
      0
    );
    if (proposedCommitment > currentPhysical) {
      throw new Error("The proposed Etsy availability exceeds current physical inventory.");
    }
    if (
      currentPhysical < 4 &&
      productItems.some((item) => item.packs_consumed === 4 && item.proposed_quantity > 0)
    ) {
      throw new Error("A 100-seed Etsy option cannot be available while physical inventory is under four packs.");
    }
  }

  const listingMappingIds = [...new Set(mappedItems.map((item) => item.listing_mapping_id!))];
  const variationMappingIds = [...new Set(mappedItems.map((item) => item.variation_mapping_id!))];
  const [{ data: listingMappings, error: listingError }, { data: variationMappings, error: variationError }] =
    await Promise.all([
      supabase.from("etsy_listing_mappings").select("id, status").in("id", listingMappingIds),
      supabase
        .from("etsy_variation_mappings")
        .select("id, status, variation_fingerprint")
        .in("id", variationMappingIds)
    ]);
  if (listingError || variationError) throw new Error("Could not revalidate confirmed Etsy mappings.");
  if ((listingMappings || []).length !== listingMappingIds.length || (listingMappings || []).some((mapping) => mapping.status !== "confirmed")) {
    throw new Error("An Etsy listing mapping is no longer confirmed.");
  }
  if ((variationMappings || []).length !== variationMappingIds.length || (variationMappings || []).some((mapping) => mapping.status !== "confirmed")) {
    throw new Error("An Etsy variation mapping is no longer confirmed.");
  }

  return new Map((variationMappings || []).map((mapping) => [Number(mapping.id), mapping.variation_fingerprint]));
}

async function validateListingInventory(
  supabase: SupabaseServiceClient,
  listingItems: ChangeItemRow[],
  variationFingerprints: Map<number, string>
) {
  const inventory = await getEtsyListingInventory(supabase, listingItems[0].listing_id);
  const normalized = normalizeEtsyListingInventory(inventory);

  for (const item of listingItems) {
    const offering = normalized.offerings.find(
      (candidate) => candidate.productId === item.etsy_product_id && candidate.offeringId === item.etsy_offering_id
    );
    if (!offering || offering.quantity !== item.before_quantity || (offering.sku || null) !== (item.sku || null)) {
      throw new Error("Etsy inventory changed after this proposal was generated.");
    }
    const expectedFingerprint = item.variation_mapping_id
      ? variationFingerprints.get(item.variation_mapping_id)
      : undefined;
    if (!expectedFingerprint || variationFingerprint(offering) !== expectedFingerprint) {
      throw new Error("The Etsy variation structure changed after mapping confirmation.");
    }
  }

  return inventory;
}

export async function applyEtsyInventoryProposal(
  supabase: SupabaseServiceClient,
  adminUserId: string,
  proposalId: string,
  confirmation: string
) {
  if (!etsyInventoryWritesEnabled()) {
    throw new Error("Etsy inventory writes are disabled pending owner review of the first generated proposal.");
  }
  if (confirmation !== "APPLY ETSY INVENTORY") {
    throw new Error("Exact owner confirmation is required before Etsy inventory can be changed.");
  }

  const { changeSet, items } = await loadChangeSet(supabase, proposalId, adminUserId);
  if (changeSet.status !== "proposed") {
    return { changeSet, items };
  }
  if (new Date(changeSet.expires_at).getTime() <= Date.now()) {
    await markChangeSet(supabase, proposalId, { status: "stale", error_summary: "Proposal expired before approval." });
    throw new Error("This inventory proposal expired. Generate and review a fresh proposal.");
  }

  const { data: connection, error: connectionError } = await supabase
    .from("etsy_connections")
    .select("granted_scopes")
    .eq("id", ETSY_CONNECTION_ID)
    .single();
  if (connectionError || !connection?.granted_scopes?.includes(ETSY_INVENTORY_WRITE_SCOPE)) {
    throw new Error("Reconnect Etsy and grant listings_w before applying an inventory proposal.");
  }

  const variationFingerprints = await validateProposalState(supabase, items);
  const actionable = items.filter((item) => item.result_status === "proposed");
  const listingIds = [...new Set(actionable.map((item) => item.listing_id))];

  for (const listingId of listingIds) {
    const allListingItems = items.filter(
      (item) => item.listing_id === listingId && (item.result_status === "proposed" || item.result_status === "no_change")
    );
    if (items.some((item) => item.listing_id === listingId && item.result_status === "blocked")) {
      throw new Error("A listing with unmatched or blocked variations cannot be written in bulk.");
    }
    await validateListingInventory(supabase, allListingItems, variationFingerprints);
  }

  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("etsy_inventory_change_sets")
    .update({ status: "applying", approved_by: adminUserId, approved_at: now })
    .eq("id", proposalId)
    .eq("admin_user_id", adminUserId)
    .eq("status", "proposed")
    .select("id")
    .maybeSingle();
  if (claimError) throw new Error(`Could not claim the Etsy proposal: ${claimError.message}`);
  if (!claimed) return loadChangeSet(supabase, proposalId, adminUserId);

  let successfulWrites = 0;

  for (let index = 0; index < listingIds.length; index += 1) {
    const listingId = listingIds[index];
    const listingItems = items.filter(
      (item) => item.listing_id === listingId && (item.result_status === "proposed" || item.result_status === "no_change")
    );
    const changedItems = listingItems.filter((item) => item.result_status === "proposed");
    let putCompleted = false;

    try {
      const freshInventory = await validateListingInventory(supabase, listingItems, variationFingerprints);
      const approvedQuantities = new Map(
        changedItems.map((item) => [
          inventoryOfferingKey(item.etsy_product_id, item.etsy_offering_id),
          item.proposed_quantity
        ])
      );
      const payload = buildEtsyInventoryUpdatePayload(freshInventory, approvedQuantities);
      await markItems(supabase, changedItems.map((item) => item.id), { attempted_at: new Date().toISOString() });
      const result = await putThenReadBackEtsyInventory(
        changedItems,
        () => updateEtsyListingInventory(supabase, listingId, payload),
        () => getEtsyListingInventoryRead(supabase, listingId),
        async (putResult) => {
          await markItems(supabase, changedItems.map((item) => item.id), {
            put_endpoint: putResult.endpoint,
            put_http_status: putResult.status,
            put_response: putResult.response
          });
          putCompleted = true;
        }
      );
      const diagnosticValues = {
        put_endpoint: result.putResult.endpoint,
        put_http_status: result.putResult.status,
        put_response: result.putResult.response,
        readback_endpoint: result.readback.endpoint,
        readback_http_status: result.readback.status,
        readback_quantities: result.verification.quantities,
        readback_at: result.readback.fetchedAt
      };
      await markItems(supabase, changedItems.map((item) => item.id), diagnosticValues);

      if (!result.verification.matches) {
        const mismatchMessage = "Etsy PUT returned success, but the immediate read-back did not match the approved quantities.";
        await markItems(supabase, changedItems.map((item) => item.id), {
          ...diagnosticValues,
          result_status: "unknown",
          etsy_status_code: result.putResult.status,
          etsy_error_message: mismatchMessage,
          completed_at: new Date().toISOString()
        });

        const remainingListingIds = listingIds.slice(index + 1);
        const remainingIds = items
          .filter((item) => remainingListingIds.includes(item.listing_id) && item.result_status === "proposed")
          .map((item) => item.id);
        await markItems(supabase, remainingIds, {
          result_status: "skipped",
          etsy_error_message: "Skipped after an earlier listing write failed immediate read-back verification.",
          completed_at: new Date().toISOString()
        });
        await markChangeSet(supabase, proposalId, {
          status: successfulWrites > 0 ? "partial" : "failed",
          error_summary: mismatchMessage,
          completed_at: new Date().toISOString()
        });
        return loadChangeSet(supabase, proposalId, adminUserId);
      }

      const verifiedAt = result.readback.fetchedAt;
      for (const item of changedItems) {
        const verified = result.verification.verified.find(
          (candidate) =>
            candidate.productId === item.etsy_product_id && candidate.offeringId === item.etsy_offering_id
        );
        const { error } = await supabase
          .from("etsy_inventory_change_items")
          .update({
            ...diagnosticValues,
            result_status: "succeeded",
            etsy_status_code: result.putResult.status,
            etsy_error_message: null,
            verified_quantity: verified?.actualQuantity,
            verified_at: verifiedAt,
            completed_at: new Date().toISOString()
          })
          .eq("id", item.id);
        if (error) throw new Error(`Could not record verified Etsy quantity: ${error.message}`);
      }
      successfulWrites += 1;
    } catch (error) {
      const resultStatus: ChangeItemRow["result_status"] = error instanceof EtsyInventoryWriteError ? "failed" : "unknown";
      const writeFailureDiagnostics = error instanceof EtsyInventoryWriteError
        ? { put_endpoint: error.endpoint, put_http_status: error.status, etsy_status_code: error.status }
        : { etsy_status_code: null };
      const readbackFailureDiagnostics = putCompleted && error instanceof EtsyHttpError
        ? { readback_endpoint: error.endpoint, readback_http_status: error.status }
        : {};

      await markItems(supabase, changedItems.map((item) => item.id), {
        result_status: resultStatus,
        ...writeFailureDiagnostics,
        ...readbackFailureDiagnostics,
        etsy_error_message: safeErrorMessage(error),
        completed_at: new Date().toISOString()
      });

      const remainingListingIds = listingIds.slice(index + 1);
      const remainingIds = items
        .filter((item) => remainingListingIds.includes(item.listing_id) && item.result_status === "proposed")
        .map((item) => item.id);
      await markItems(supabase, remainingIds, {
        result_status: "skipped",
        etsy_error_message: "Skipped after an earlier listing write did not complete cleanly.",
        completed_at: new Date().toISOString()
      });
      await markChangeSet(supabase, proposalId, {
        status: successfulWrites > 0 ? "partial" : "failed",
        error_summary: safeErrorMessage(error),
        completed_at: new Date().toISOString()
      });
      return loadChangeSet(supabase, proposalId, adminUserId);
    }
  }

  const finalAudit = await loadChangeSet(supabase, proposalId, adminUserId);
  if (!changeSetMeetsCompletionInvariant(finalAudit.items)) {
    await markChangeSet(supabase, proposalId, {
      status: successfulWrites > 0 ? "partial" : "failed",
      error_summary: "The Etsy change set did not satisfy the verified-quantity completion invariant.",
      completed_at: new Date().toISOString()
    });
    return loadChangeSet(supabase, proposalId, adminUserId);
  }

  await markChangeSet(supabase, proposalId, { status: "completed", completed_at: new Date().toISOString() });
  return loadChangeSet(supabase, proposalId, adminUserId);
}
