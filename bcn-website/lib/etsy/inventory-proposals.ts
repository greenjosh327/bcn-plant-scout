import { randomUUID } from "node:crypto";
import type { SupabaseServiceClient } from "@/lib/admin-api";
import { getEtsyDashboard } from "./client";
import { ETSY_CONNECTION_ID, ETSY_INVENTORY_WRITE_SCOPE, etsyInventoryWritesEnabled } from "./config";
import {
  MANAGED_SEED_SPECIES,
  calculateSafeAllocation,
  findManagedSpeciesByProductId,
  packSizeQuantityVaries,
  stableInventoryFingerprint,
  suggestManagedSpecies,
  suggestPacksConsumed,
  variationFingerprint,
  variationLabel,
  type ManagedSeedSpecies
} from "./inventory-allocation";
import type { EtsyDashboardListing, EtsyDashboardOffering } from "./types";

type PhysicalProductRow = {
  id: string;
  common_name: string | null;
  scientific_name: string | null;
  inventory: number;
  active: boolean;
  updated_at: string;
};

type ListingMappingRow = {
  id: number;
  listing_id: number;
  listing_title: string;
  bcn_product_id: string | null;
  status: "suggested" | "confirmed" | "manual_review" | "blocked";
  block_reason: string | null;
};

type VariationMappingRow = {
  id: number;
  listing_mapping_id: number;
  etsy_product_id: number;
  etsy_offering_id: number;
  bcn_variant_id: string | null;
  variation_fingerprint: string;
  packs_consumed: number | null;
  status: "suggested" | "confirmed" | "manual_review" | "blocked";
  block_reason: string | null;
};

export type PhysicalSeedInventoryItem = {
  productId: string;
  species: string;
  scientificName: string;
  physicalPacks: number;
  totalSeeds: number;
  activeInBcnShop: boolean;
  updatedAt: string;
};

export type EtsyInventoryProposalRow = {
  listingMappingId: number | null;
  variationMappingId: number | null;
  productId: string | null;
  species: string;
  listingId: number;
  listingTitle: string;
  etsyProductId: number;
  etsyOfferingId: number;
  sku: string | null;
  variationName: string;
  isEnabled: boolean;
  packsConsumed: 1 | 4 | null;
  currentQuantity: number;
  currentPackCommitment: number | null;
  physicalPackInventory: number | null;
  proposedQuantity: number;
  proposedPackCommitment: number | null;
  matchStatus: "confirmed" | "suggested" | "manual_review" | "blocked";
  canConfirmMapping: boolean;
  eligible: boolean;
  warning: string;
  isChange: boolean;
};

export type EtsyInventoryProposal = {
  proposalId: string;
  expiresAt: string;
  grantedScopes: string[];
  hasInventoryWriteScope: boolean;
  inventoryWritesEnabled: boolean;
  canApply: boolean;
  physicalInventory: PhysicalSeedInventoryItem[];
  rows: EtsyInventoryProposalRow[];
  summary: {
    changedOfferings: number;
    confirmedOfferings: number;
    blockedOfferings: number;
    currentPackCommitment: number;
    proposedPackCommitment: number;
  };
};

function offeringKey(listingId: number, productId: number, offeringId: number) {
  return `${listingId}:${productId}:${offeringId}`;
}

async function loadPhysicalInventory(supabase: SupabaseServiceClient) {
  const productIds = MANAGED_SEED_SPECIES.map((species) => species.productId);
  const { data, error } = await supabase
    .from("products")
    .select("id, common_name, scientific_name, inventory, active, updated_at")
    .in("id", productIds);

  if (error) throw new Error(`Could not load BCN physical seed inventory: ${error.message}`);
  const byId = new Map((data as PhysicalProductRow[] | null)?.map((product) => [product.id, product]) || []);

  return MANAGED_SEED_SPECIES.map((species) => {
    const product = byId.get(species.productId);
    if (!product) throw new Error(`BCN physical inventory product is missing for ${species.species}.`);
    const physicalPacks = Math.max(0, Number(product.inventory) || 0);
    return {
      productId: product.id,
      species: species.species,
      scientificName: species.scientificName,
      physicalPacks,
      totalSeeds: physicalPacks * 25,
      activeInBcnShop: Boolean(product.active),
      updatedAt: product.updated_at
    } satisfies PhysicalSeedInventoryItem;
  });
}

async function loadMappings(supabase: SupabaseServiceClient, listingIds: number[]) {
  if (listingIds.length === 0) return { listings: [] as ListingMappingRow[], variations: [] as VariationMappingRow[] };

  const { data: listingData, error: listingError } = await supabase
    .from("etsy_listing_mappings")
    .select("id, listing_id, listing_title, bcn_product_id, status, block_reason")
    .eq("connection_id", ETSY_CONNECTION_ID)
    .in("listing_id", listingIds);
  if (listingError) throw new Error(`Could not load Etsy listing mappings: ${listingError.message}`);

  const listings = (listingData as ListingMappingRow[] | null) || [];
  if (listings.length === 0) return { listings, variations: [] as VariationMappingRow[] };

  const { data: variationData, error: variationError } = await supabase
    .from("etsy_variation_mappings")
    .select(
      "id, listing_mapping_id, etsy_product_id, etsy_offering_id, bcn_variant_id, variation_fingerprint, packs_consumed, status, block_reason"
    )
    .in("listing_mapping_id", listings.map((listing) => listing.id));
  if (variationError) throw new Error(`Could not load Etsy variation mappings: ${variationError.message}`);

  return { listings, variations: (variationData as VariationMappingRow[] | null) || [] };
}

function listingMatch(
  listing: EtsyDashboardListing,
  listingMapping: ListingMappingRow | undefined,
  variationMappings: VariationMappingRow[],
  physicalById: Map<string, PhysicalSeedInventoryItem>
) {
  const suggestedSpecies = suggestManagedSpecies(listing.title);
  const mappedSpecies = findManagedSpeciesByProductId(listingMapping?.bcn_product_id);
  const species = mappedSpecies || suggestedSpecies;
  const blackCherryBlocked = Boolean(species?.blockedFromWrites);
  const titleChanged = listingMapping?.status === "confirmed" && listingMapping.listing_title !== listing.title;
  const variationsByKey = new Map(
    variationMappings.map((mapping) => [`${mapping.etsy_product_id}:${mapping.etsy_offering_id}`, mapping])
  );
  const listingQuantityStructureSafe =
    !listing.inventory.hasVariations ||
    (listing.inventory.quantityVaries && listing.inventory.offerings.every(packSizeQuantityVaries));

  const offeringDetails = listing.inventory.offerings.map((offering) => {
    const mapping = variationsByKey.get(`${offering.productId}:${offering.offeringId}`);
    const suggestedPacks = suggestPacksConsumed(listing, offering);
    const fingerprint = variationFingerprint(offering);
    const confirmedMapping =
      listingMapping?.status === "confirmed" &&
      mapping?.status === "confirmed" &&
      mapping.variation_fingerprint === fingerprint &&
      (mapping.packs_consumed === 1 || mapping.packs_consumed === 4);
    const packsConsumed = confirmedMapping ? (mapping.packs_consumed as 1 | 4) : suggestedPacks;

    return { offering, mapping, suggestedPacks, packsConsumed, confirmedMapping };
  });

  const everyOfferingConfirmed =
    offeringDetails.length > 0 && offeringDetails.every((offering) => offering.confirmedMapping);
  const confirmed =
    listingMapping?.status === "confirmed" &&
    Boolean(mappedSpecies) &&
    !blackCherryBlocked &&
    !titleChanged &&
    listingQuantityStructureSafe &&
    everyOfferingConfirmed;
  const canConfirm =
    !listingMapping?.status || listingMapping.status !== "confirmed"
      ? Boolean(
          suggestedSpecies &&
          !suggestedSpecies.blockedFromWrites &&
          listingQuantityStructureSafe &&
          offeringDetails.length > 0 &&
          offeringDetails.every((offering) => offering.suggestedPacks === 1 || offering.suggestedPacks === 4)
        )
      : Boolean(
          suggestedSpecies &&
          !suggestedSpecies.blockedFromWrites &&
          listingQuantityStructureSafe &&
          (titleChanged || !everyOfferingConfirmed)
        );

  let matchStatus: EtsyInventoryProposalRow["matchStatus"] = "manual_review";
  let warning = "Species or pack size could not be matched confidently. This listing remains read only.";

  if (blackCherryBlocked) {
    matchStatus = "blocked";
    warning = "Black Cherry is blocked until Etsy reports quantity varying by the pack-size property.";
  } else if (!listingQuantityStructureSafe) {
    matchStatus = "blocked";
    warning = "Etsy quantity does not vary safely by the pack-size option. No inventory write is allowed.";
  } else if (titleChanged) {
    matchStatus = "manual_review";
    warning = "The Etsy listing title changed after confirmation. Reconfirm the mapping before any write.";
  } else if (confirmed) {
    matchStatus = "confirmed";
    warning = "Confirmed mapping; quantity is eligible for the controlled proposal calculation.";
  } else if (suggestedSpecies && offeringDetails.every((offering) => offering.suggestedPacks)) {
    matchStatus = "suggested";
    warning = "Exact species and pack-size match suggested. Owner confirmation is required before writes.";
  }

  return {
    species,
    physical: species ? physicalById.get(species.productId) || null : null,
    listingMapping,
    offeringDetails,
    confirmed,
    canConfirm,
    matchStatus,
    warning
  };
}

function buildRows(
  listings: EtsyDashboardListing[],
  physicalInventory: PhysicalSeedInventoryItem[],
  listingMappings: ListingMappingRow[],
  variationMappings: VariationMappingRow[]
) {
  const physicalById = new Map(physicalInventory.map((product) => [product.productId, product]));
  const listingMappingById = new Map(listingMappings.map((mapping) => [Number(mapping.listing_id), mapping]));
  const variationMappingsByListing = new Map<number, VariationMappingRow[]>();
  for (const mapping of variationMappings) {
    const existing = variationMappingsByListing.get(mapping.listing_mapping_id) || [];
    existing.push(mapping);
    variationMappingsByListing.set(mapping.listing_mapping_id, existing);
  }

  const rows: EtsyInventoryProposalRow[] = [];

  for (const listing of listings) {
    const listingMapping = listingMappingById.get(listing.listingId);
    const match = listingMatch(
      listing,
      listingMapping,
      listingMapping ? variationMappingsByListing.get(listingMapping.id) || [] : [],
      physicalById
    );

    for (const detail of match.offeringDetails) {
      const { offering, mapping, packsConsumed } = detail;
      const currentCommitment = packsConsumed && offering.isEnabled ? offering.quantity * packsConsumed : null;
      rows.push({
        listingMappingId: listingMapping?.id || null,
        variationMappingId: mapping?.id || null,
        productId: match.species?.productId || null,
        species: match.species?.species || "Unmatched",
        listingId: listing.listingId,
        listingTitle: listing.title,
        etsyProductId: offering.productId,
        etsyOfferingId: offering.offeringId,
        sku: offering.sku,
        variationName: variationLabel(offering),
        isEnabled: offering.isEnabled,
        packsConsumed,
        currentQuantity: offering.quantity,
        currentPackCommitment: currentCommitment,
        physicalPackInventory: match.physical?.physicalPacks ?? null,
        proposedQuantity: offering.quantity,
        proposedPackCommitment: currentCommitment,
        matchStatus: match.matchStatus,
        canConfirmMapping: match.canConfirm,
        eligible: match.confirmed,
        warning: offering.isEnabled ? match.warning : `${match.warning} This Etsy offering is currently disabled.`,
        isChange: false
      });
    }
  }

  const confirmedByProduct = new Map<string, EtsyInventoryProposalRow[]>();
  for (const row of rows.filter((item) => item.eligible && item.productId && item.packsConsumed)) {
    const existing = confirmedByProduct.get(row.productId!) || [];
    existing.push(row);
    confirmedByProduct.set(row.productId!, existing);
  }

  for (const [productId, productRows] of confirmedByProduct) {
    const physical = physicalById.get(productId);
    if (!physical) continue;
    const allocation = calculateSafeAllocation(
      physical.physicalPacks,
      productRows.map((row) => ({
        key: offeringKey(row.listingId, row.etsyProductId, row.etsyOfferingId),
        quantity: row.currentQuantity,
        packsConsumed: row.packsConsumed!,
        isEnabled: row.isEnabled
      }))
    );

    for (const row of productRows) {
      const key = `${row.listingId}:${row.etsyProductId}:${row.etsyOfferingId}`;
      const proposedQuantity = allocation.proposed.get(key) ?? row.currentQuantity;
      row.proposedQuantity = proposedQuantity;
      row.proposedPackCommitment = row.isEnabled ? proposedQuantity * row.packsConsumed! : 0;
      row.isChange = proposedQuantity !== row.currentQuantity;

      if (allocation.status === "manual_allocation") {
        row.eligible = false;
        row.matchStatus = "manual_review";
        row.warning = "Multiple Etsy offerings compete for this physical stock. Manual allocation is required.";
      } else if (allocation.status === "below_100_seed_threshold") {
        row.warning = "Physical stock is under four packs: the 100-seed quantity must be zero; only 25-seed stock may be offered.";
      } else if (allocation.status === "reduced_to_physical_stock") {
        row.warning = "Current Etsy availability exceeds physical stock; this proposal reduces the quantity to a safe level.";
      } else {
        row.warning = "Current Etsy availability is within confirmed physical stock.";
      }
    }
  }

  return rows;
}

async function persistProposal(
  supabase: SupabaseServiceClient,
  adminUserId: string,
  shopId: number,
  sourceFingerprint: string,
  expiresAt: string,
  rows: EtsyInventoryProposalRow[]
) {
  const idempotencyKey = randomUUID();
  const { data: changeSet, error: changeSetError } = await supabase
    .from("etsy_inventory_change_sets")
    .insert({
      connection_id: ETSY_CONNECTION_ID,
      admin_user_id: adminUserId,
      idempotency_key: idempotencyKey,
      source_fingerprint: sourceFingerprint,
      expires_at: expiresAt,
      status: "proposed"
    })
    .select("id")
    .single();
  if (changeSetError || !changeSet) {
    throw new Error(`Could not save the Etsy inventory proposal: ${changeSetError?.message || "Unknown error"}`);
  }

  if (rows.length > 0) {
    const { error: itemsError } = await supabase.from("etsy_inventory_change_items").insert(
      rows.map((row) => ({
        change_set_id: changeSet.id,
        listing_mapping_id: row.listingMappingId,
        variation_mapping_id: row.variationMappingId,
        bcn_product_id: row.productId,
        species: row.species,
        shop_id: shopId,
        listing_id: row.listingId,
        listing_title: row.listingTitle,
        etsy_product_id: row.etsyProductId,
        etsy_offering_id: row.etsyOfferingId,
        sku: row.sku,
        variation_name: row.variationName,
        packs_consumed: row.packsConsumed,
        before_quantity: row.currentQuantity,
        proposed_quantity: row.proposedQuantity,
        before_pack_commitment: row.currentPackCommitment,
        proposed_pack_commitment: row.proposedPackCommitment,
        physical_pack_inventory: row.physicalPackInventory,
        warning_status: row.warning,
        result_status: row.eligible ? (row.isChange ? "proposed" : "no_change") : "blocked"
      }))
    );
    if (itemsError) throw new Error(`Could not save Etsy proposal items: ${itemsError.message}`);
  }

  return String(changeSet.id);
}

export async function generateEtsyInventoryProposal(
  supabase: SupabaseServiceClient,
  adminUserId: string
): Promise<EtsyInventoryProposal> {
  const [dashboard, physicalInventory] = await Promise.all([
    getEtsyDashboard(supabase),
    loadPhysicalInventory(supabase)
  ]);
  if (!dashboard.connected) throw new Error("Etsy must be connected before generating an inventory proposal.");

  const mappings = await loadMappings(
    supabase,
    dashboard.listings.map((listing) => listing.listingId)
  );
  const rows = buildRows(dashboard.listings, physicalInventory, mappings.listings, mappings.variations);
  const sourceFingerprint = stableInventoryFingerprint({
    physicalInventory,
    listings: dashboard.listings.map((listing) => ({
      listingId: listing.listingId,
      title: listing.title,
      offerings: listing.inventory.offerings
    }))
  });
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const proposalId = await persistProposal(
    supabase,
    adminUserId,
    dashboard.shop.shopId,
    sourceFingerprint,
    expiresAt,
    rows
  );
  const hasInventoryWriteScope = dashboard.grantedScopes.includes(ETSY_INVENTORY_WRITE_SCOPE);
  const writesEnabled = etsyInventoryWritesEnabled();
  const changedRows = rows.filter((row) => row.eligible && row.isChange);

  return {
    proposalId,
    expiresAt,
    grantedScopes: dashboard.grantedScopes,
    hasInventoryWriteScope,
    inventoryWritesEnabled: writesEnabled,
    canApply: hasInventoryWriteScope && writesEnabled && changedRows.length > 0,
    physicalInventory,
    rows,
    summary: {
      changedOfferings: changedRows.length,
      confirmedOfferings: rows.filter((row) => row.eligible).length,
      blockedOfferings: rows.filter((row) => !row.eligible).length,
      currentPackCommitment: rows.reduce((total, row) => total + (row.currentPackCommitment || 0), 0),
      proposedPackCommitment: rows.reduce((total, row) => total + (row.proposedPackCommitment || 0), 0)
    }
  };
}

export async function confirmSuggestedEtsyMapping(
  supabase: SupabaseServiceClient,
  adminUserId: string,
  listingId: number
) {
  const dashboard = await getEtsyDashboard(supabase);
  if (!dashboard.connected) throw new Error("Etsy must be connected before confirming a mapping.");
  const listing = dashboard.listings.find((candidate) => candidate.listingId === listingId);
  if (!listing) throw new Error("The active Etsy listing was not found.");

  const species = suggestManagedSpecies(listing.title);
  if (!species) throw new Error("This listing does not have one exact managed-species match.");
  if (species.blockedFromWrites) throw new Error("Black Cherry cannot be confirmed for inventory writes yet.");
  if (listing.inventory.offerings.length === 0) throw new Error("Etsy returned no inventory offerings for this listing.");
  if (
    listing.inventory.hasVariations &&
    (!listing.inventory.quantityVaries || !listing.inventory.offerings.every(packSizeQuantityVaries))
  ) {
    throw new Error("Etsy quantity does not vary safely by the pack-size option.");
  }

  const offerings = listing.inventory.offerings.map((offering) => {
    const packsConsumed = suggestPacksConsumed(listing, offering);
    if (packsConsumed !== 1 && packsConsumed !== 4) {
      throw new Error(`Pack size could not be confirmed for ${variationLabel(offering)}.`);
    }
    return { offering, packsConsumed };
  });

  const { data: listingMapping, error: listingError } = await supabase
    .from("etsy_listing_mappings")
    .upsert(
      {
        connection_id: ETSY_CONNECTION_ID,
        shop_id: dashboard.shop.shopId,
        listing_id: listing.listingId,
        listing_title: listing.title,
        bcn_product_id: species.productId,
        status: "confirmed",
        match_method: "owner_confirmed_exact_species_and_pack_size",
        block_reason: null,
        confirmed_by: adminUserId,
        confirmed_at: new Date().toISOString()
      },
      { onConflict: "connection_id,listing_id" }
    )
    .select("id")
    .single();
  if (listingError || !listingMapping) {
    throw new Error(`Could not confirm the Etsy listing mapping: ${listingError?.message || "Unknown error"}`);
  }

  const { data: variants, error: variantsError } = await supabase
    .from("product_variants")
    .select("id, packs_consumed")
    .eq("product_id", species.productId)
    .eq("active", true);
  if (variantsError) throw new Error(`Could not load BCN pack variants: ${variantsError.message}`);

  const { error: staleVariationError } = await supabase
    .from("etsy_variation_mappings")
    .update({ status: "manual_review", block_reason: "Etsy inventory structure changed after confirmation." })
    .eq("listing_mapping_id", listingMapping.id);
  if (staleVariationError) throw new Error(`Could not invalidate old Etsy variation mappings: ${staleVariationError.message}`);

  const confirmedAt = new Date().toISOString();
  const variationRecords = offerings.map(({ offering, packsConsumed }) => {
    const matchingVariants = (variants || []).filter((variant) => Number(variant.packs_consumed) === packsConsumed);
    return {
      listing_mapping_id: listingMapping.id,
      etsy_product_id: offering.productId,
      etsy_offering_id: offering.offeringId,
      bcn_variant_id: matchingVariants.length === 1 ? matchingVariants[0].id : null,
      sku: offering.sku,
      variation_label: variationLabel(offering),
      variation_fingerprint: variationFingerprint(offering),
      packs_consumed: packsConsumed,
      status: "confirmed",
      block_reason: null,
      confirmed_by: adminUserId,
      confirmed_at: confirmedAt
    };
  });
  const { error: variationError } = await supabase
    .from("etsy_variation_mappings")
    .upsert(variationRecords, { onConflict: "listing_mapping_id,etsy_product_id,etsy_offering_id" });
  if (variationError) throw new Error(`Could not confirm Etsy variation mappings: ${variationError.message}`);

  return { listingId: listing.listingId, productId: species.productId, species: species.species };
}

export function managedSpeciesForTesting() {
  return MANAGED_SEED_SPECIES.map((species: ManagedSeedSpecies) => ({ ...species }));
}
