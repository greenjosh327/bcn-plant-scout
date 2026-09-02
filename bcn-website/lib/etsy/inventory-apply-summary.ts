export type EtsyAppliedChangeItem = {
  species: string | null;
  listing_id: number;
  listing_title: string;
  sku: string | null;
  variation_name: string;
  before_quantity: number;
  proposed_quantity: number;
  result_status: string;
  verified_quantity: number | null;
  verified_at: string | null;
};

export type VerifiedEtsyOfferingSummary = {
  species: string;
  listingId: number;
  listingTitle: string;
  sku: string | null;
  variationName: string;
  finalVerifiedQuantity: number;
  verifiedAt: string;
};

export function buildVerifiedEtsyOfferingSummary(
  items: EtsyAppliedChangeItem[]
): VerifiedEtsyOfferingSummary[] {
  return items
    .filter(
      (item) =>
        item.before_quantity !== item.proposed_quantity &&
        item.result_status === "succeeded" &&
        item.verified_quantity === item.proposed_quantity &&
        Boolean(item.verified_at)
    )
    .map((item) => ({
      species: item.species || "Matched species",
      listingId: Number(item.listing_id),
      listingTitle: item.listing_title,
      sku: item.sku,
      variationName: item.variation_name,
      finalVerifiedQuantity: Number(item.verified_quantity),
      verifiedAt: item.verified_at!
    }));
}
