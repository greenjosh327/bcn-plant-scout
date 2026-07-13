export const SHIPPING_CLASSES = [
  "seed_envelope",
  "seed_package",
  "small_package",
  "cutting",
  "live_plant",
  "tree",
  "oversized_pickup_only",
  "digital"
] as const;

export type ShippingClass = (typeof SHIPPING_CLASSES)[number];

export const SHIPPING_CLASS_LABELS: Record<ShippingClass, string> = {
  seed_envelope: "Seed Envelope",
  seed_package: "Seed Package",
  small_package: "Small Package",
  cutting: "Cutting",
  live_plant: "Live Plant",
  tree: "Tree",
  oversized_pickup_only: "Oversized / Pickup Only",
  digital: "Digital"
};

export const SHIPPING_CLASS_DESCRIPTIONS: Record<ShippingClass, string> = {
  seed_envelope: "Light seed packets that fit in a 4 x 6 envelope.",
  seed_package: "Seeds that need a padded mailer or small box.",
  small_package: "Nursery supplies and small physical products.",
  cutting: "Live or dormant cuttings.",
  live_plant: "Smaller live plants that are not trees.",
  tree: "Bare-root or potted trees that require Priority Mail or faster.",
  oversized_pickup_only: "Items BCN will not normally ship.",
  digital: "Digital or GIS products with no physical fulfillment."
};

export const SHIPPING_METHOD_CODES = [
  "economy_seed_untracked",
  "usps_ground_advantage",
  "usps_priority",
  "usps_priority_express",
  "local_pickup",
  "digital_delivery"
] as const;

export type ShippingMethodCode = (typeof SHIPPING_METHOD_CODES)[number];

export type ShippingPackagePreset = {
  id: string;
  name: string;
  code: string;
  length_in: number;
  width_in: number;
  height_in: number;
  empty_weight_oz: number;
  maximum_weight_oz: number;
  allowed_shipping_classes: ShippingClass[];
  active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export function isShippingClass(value: string | null | undefined): value is ShippingClass {
  return SHIPPING_CLASSES.includes(value as ShippingClass);
}

export function isPhysicalShippingClass(value: ShippingClass | "") {
  return Boolean(value && value !== "digital");
}

export function requiresPackageData(value: ShippingClass | "") {
  return Boolean(value && value !== "digital" && value !== "oversized_pickup_only");
}

export function canUseGroundAdvantage(value: ShippingClass | "") {
  return Boolean(value && !["tree", "oversized_pickup_only", "digital"].includes(value));
}
