import type { Product } from "./types";

export const SEED_PROVENANCE_NOTE =
  "Small-batch seed lots are gathered, cleaned, processed, and packed by Josh at Base Camp North with help from a few friends in Pennsylvania.";

export const SEED_PROVENANCE_SUMMARY =
  "Small-batch seeds gathered, cleaned, processed, and packed by Base Camp North in Pennsylvania";

export const SEED_CARD_PROVENANCE =
  "Gathered, processed, and packed by Base Camp North.";

export function getProductProvenanceNote(product: Pick<Product, "category">) {
  return product.category === "Seeds" ? SEED_PROVENANCE_NOTE : "";
}

export function getProductProvenanceSummary(product: Pick<Product, "category">) {
  return product.category === "Seeds" ? SEED_PROVENANCE_SUMMARY : "";
}

export function getProductCardProvenance(product: Pick<Product, "category">) {
  return product.category === "Seeds" ? SEED_CARD_PROVENANCE : "";
}

export function prependProductProvenance(product: Pick<Product, "category">, value: string) {
  const provenance = getProductProvenanceSummary(product);
  const cleanValue = value.trim();
  if (!provenance || !cleanValue || hasProvenanceLanguage(cleanValue)) return cleanValue;
  return `${provenance}; ${cleanValue}`;
}

function hasProvenanceLanguage(value: string) {
  return /gathered, cleaned, processed, and packed by Base Camp North|packed by Base Camp North|packaged by Base Camp North/i.test(value);
}
