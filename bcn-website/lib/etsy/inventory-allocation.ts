import { createHash } from "node:crypto";
import type { EtsyDashboardListing, EtsyDashboardOffering } from "./types";

export type ManagedSeedSpecies = {
  productId: string;
  species: string;
  scientificName: string;
  blockedFromWrites?: boolean;
  aliases: string[];
};

export const MANAGED_SEED_SPECIES: ManagedSeedSpecies[] = [
  {
    productId: "prod_catalpa-speciosa-seeds",
    species: "Catalpa",
    scientificName: "Catalpa speciosa",
    aliases: ["northern catalpa", "catalpa speciosa", "catalpa"]
  },
  {
    productId: "prod_fragrant-sumac-seeds",
    species: "Fragrant Sumac",
    scientificName: "Rhus aromatica",
    aliases: ["fragrant sumac", "rhus aromatica"]
  },
  {
    productId: "prod_donald-wyman-crabapple-seeds",
    species: "Donald Wyman Crabapple",
    scientificName: "Malus 'Donald Wyman'",
    aliases: ["donald wyman crabapple", "donald wyman"]
  },
  {
    productId: "prod_prairifire-crabapple-seeds",
    species: "Prairifire Crabapple",
    scientificName: "Malus 'Prairifire'",
    aliases: ["prairifire crabapple", "prairifire"]
  },
  {
    productId: "prod_6365ffae-5dda-4d0c-84e6-90b20469d2b1",
    species: "Black Huckleberry",
    scientificName: "Gaylussacia baccata",
    aliases: ["black huckleberry", "gaylussacia baccata"]
  },
  {
    productId: "prod_373a4d3c-96b8-493b-a1b1-edf62ada5fb5",
    species: "Beach Plum",
    scientificName: "Prunus maritima",
    aliases: ["beach plum", "prunus maritima"]
  },
  {
    productId: "prod_0b70691c-58ab-45d0-b392-87f19b0433bf",
    species: "Black Cherry",
    scientificName: "Prunus serotina",
    blockedFromWrites: true,
    aliases: ["black cherry", "prunus serotina"]
  },
  {
    productId: "prod_bb82b070-4894-4f5e-b332-660b47584560",
    species: "Black Chokeberry",
    scientificName: "Aronia melanocarpa",
    aliases: ["black chokeberry", "aronia melanocarpa"]
  },
  {
    productId: "prod_c747934f-4a0c-4850-a205-e90a8c1f0dc5",
    species: "Red Elderberry",
    scientificName: "Sambucus racemosa",
    aliases: ["red elderberry", "sambucus racemosa"]
  }
];

const MULTI_SPECIES_PATTERN = /\b(bundle|bundled|mix|mixed|mixture|assortment|collection|varieties|variety)\b/i;
const STAGHORN_PATTERN = /\b(staghorn sumac|rhus typhina)\b/i;

function normalizedText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[^a-zA-Z0-9']+/g, " ")
    .trim()
    .toLowerCase();
}

export function findManagedSpeciesByProductId(productId: string | null | undefined) {
  return MANAGED_SEED_SPECIES.find((species) => species.productId === productId) ?? null;
}

export function suggestManagedSpecies(listingTitle: string) {
  const normalizedTitle = normalizedText(listingTitle);

  if (STAGHORN_PATTERN.test(normalizedTitle) || MULTI_SPECIES_PATTERN.test(normalizedTitle)) return null;

  const matches = MANAGED_SEED_SPECIES.filter((candidate) =>
    candidate.aliases.some((alias) => normalizedTitle.includes(normalizedText(alias)))
  );

  return matches.length === 1 ? matches[0] : null;
}

function containsPackSize(text: string, size: 25 | 100) {
  const normalized = normalizedText(text);
  const expression = new RegExp(`(^|\\s)${size}(?=\\s|$)`);
  return expression.test(normalized);
}

export function suggestPacksConsumed(
  listing: Pick<EtsyDashboardListing, "title">,
  offering: Pick<EtsyDashboardOffering, "options" | "sku">
) {
  const optionText = offering.options.map((option) => `${option.name} ${option.value}`).join(" ");
  const skuText = offering.sku || "";
  const combined = `${optionText} ${skuText} ${offering.options.length === 0 ? listing.title : ""}`;
  const has25 = containsPackSize(combined, 25) || /(?:^|[-_])25(?:$|[-_])/i.test(skuText);
  const has100 = containsPackSize(combined, 100) || /(?:^|[-_])100(?:$|[-_])/i.test(skuText);

  if (has25 === has100) return null;
  return has100 ? 4 : 1;
}

export function variationLabel(offering: Pick<EtsyDashboardOffering, "options">) {
  if (offering.options.length === 0) return "Default offering";
  return offering.options.map((option) => `${option.name}: ${option.value}`).join(" / ");
}

export function variationFingerprint(offering: Pick<EtsyDashboardOffering, "options" | "sku">) {
  const normalizedOptions = offering.options
    .map((option) => ({ propertyId: option.propertyId, name: option.name, value: option.value }))
    .sort((left, right) => left.propertyId - right.propertyId || left.value.localeCompare(right.value));
  return createHash("sha256")
    .update(JSON.stringify({ sku: offering.sku || "", options: normalizedOptions }))
    .digest("hex");
}

export function packSizeQuantityVaries(offering: Pick<EtsyDashboardOffering, "options">) {
  const sizeOptions = offering.options.filter((option) =>
    containsPackSize(`${option.name} ${option.value}`, 25) || containsPackSize(`${option.name} ${option.value}`, 100)
  );
  return sizeOptions.length > 0 && sizeOptions.every((option) => option.quantityVaries);
}

export type AllocationOffering = {
  key: string;
  quantity: number;
  packsConsumed: 1 | 4;
  isEnabled: boolean;
};

export type SafeAllocation = {
  proposed: Map<string, number>;
  currentCommitment: number;
  proposedCommitment: number;
  status: "within_stock" | "below_100_seed_threshold" | "reduced_to_physical_stock" | "manual_allocation";
};

export function calculateSafeAllocation(physicalPacks: number, offerings: AllocationOffering[]): SafeAllocation {
  const availablePacks = Math.max(0, Math.floor(physicalPacks));
  const proposed = new Map(offerings.map((offering) => [offering.key, Math.max(0, Math.floor(offering.quantity))]));
  const enabledOfferings = offerings.filter((offering) => offering.isEnabled);
  const currentCommitment = enabledOfferings.reduce(
    (total, offering) => total + Math.max(0, Math.floor(offering.quantity)) * offering.packsConsumed,
    0
  );

  const twentyFiveOfferings = enabledOfferings.filter((offering) => offering.packsConsumed === 1);
  const hundredOfferings = enabledOfferings.filter((offering) => offering.packsConsumed === 4);

  if (twentyFiveOfferings.length > 1 || hundredOfferings.length > 1) {
    return { proposed, currentCommitment, proposedCommitment: currentCommitment, status: "manual_allocation" };
  }

  let status: SafeAllocation["status"] = "within_stock";

  if (availablePacks < 4) {
    for (const offering of hundredOfferings) proposed.set(offering.key, 0);
    if (twentyFiveOfferings.length === 1) proposed.set(twentyFiveOfferings[0].key, availablePacks);
    status = "below_100_seed_threshold";
  }

  let proposedCommitment = enabledOfferings.reduce(
    (total, offering) => total + (proposed.get(offering.key) || 0) * offering.packsConsumed,
    0
  );

  if (proposedCommitment > availablePacks && hundredOfferings.length === 1) {
    const hundred = hundredOfferings[0];
    const reduction = Math.min(
      proposed.get(hundred.key) || 0,
      Math.ceil((proposedCommitment - availablePacks) / 4)
    );
    proposed.set(hundred.key, Math.max(0, (proposed.get(hundred.key) || 0) - reduction));
    proposedCommitment -= reduction * 4;
    status = "reduced_to_physical_stock";
  }

  if (proposedCommitment > availablePacks && twentyFiveOfferings.length === 1) {
    const twentyFive = twentyFiveOfferings[0];
    const reduction = Math.min(proposed.get(twentyFive.key) || 0, proposedCommitment - availablePacks);
    proposed.set(twentyFive.key, Math.max(0, (proposed.get(twentyFive.key) || 0) - reduction));
    proposedCommitment -= reduction;
    status = "reduced_to_physical_stock";
  }

  if (proposedCommitment > availablePacks) {
    return { proposed, currentCommitment, proposedCommitment, status: "manual_allocation" };
  }

  return { proposed, currentCommitment, proposedCommitment, status };
}

export function stableInventoryFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
