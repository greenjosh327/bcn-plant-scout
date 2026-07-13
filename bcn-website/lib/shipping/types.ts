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

export type ShippingProviderName = "shippo" | "flat_rate" | "manual_usps_letter" | "local_pickup" | "digital_delivery";

export type ShippingRateMode = "no_charge" | "manual_flat" | "fallback_flat" | "live_rate_required";

export const SHIPPING_METHOD_LABELS: Record<ShippingMethodCode, string> = {
  economy_seed_untracked: "Economy Seed Mail - No Tracking",
  usps_ground_advantage: "USPS Ground Advantage - Tracked",
  usps_priority: "USPS Priority Mail",
  usps_priority_express: "USPS Priority Mail Express",
  local_pickup: "Local Pickup - Effort, Pennsylvania",
  digital_delivery: "Digital Delivery"
};

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

export type ShippingSettings = {
  shippoEnabled: boolean;
  shippoMode: "test" | "live";
  allowedCarrier: "usps";
  flatRateFallbackEnabled: boolean;
  automaticLabelPurchase: boolean;
  economySeedMailCents: number;
  trackedSeedFallbackCents: number;
  cuttingSmallPlantFallbackCents: number;
  treeFallbackEnabled: boolean;
  localPickupCents: number;
  quoteExpirationMinutes: number;
  handlingFeeCents: number;
  freeShippingThresholdCents: number | null;
  allowedUspsServiceLevels: string[];
  groundAdvantageEnabled: boolean;
  priorityMailEnabled: boolean;
  priorityMailExpressEnabled: boolean;
  economySeedMailEnabled: boolean;
  maxSeedPacketsPerEconomyEnvelope: number;
  maxEconomyEnvelopeWeightOz: number;
  shipFromAddress: ShippingAddress | null;
  pickupDisplayLocation: string;
  liveRatesMaintenanceMode: boolean;
};

export type ShippingAddress = {
  name?: string;
  organization?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
};

export type AddressValidationStatus =
  | "not_required"
  | "not_validated"
  | "validated"
  | "corrected"
  | "customer_confirmed"
  | "invalid"
  | "validation_unavailable";

export type ShippingQuoteOption = ShippingMethodOption & {
  id: string;
  amountCents: number;
  carrier?: string;
  serviceName?: string;
  serviceToken?: string;
  shippoRateIds?: string[];
  shippoShipmentIds?: string[];
  estimatedDays?: number | null;
  durationTerms?: string;
};

export type ShippingQuoteRecord = {
  id: string;
  cart_fingerprint: string;
  customer_email: string | null;
  destination_address: ShippingAddress | Record<string, unknown>;
  validated_address: ShippingAddress | Record<string, unknown>;
  address_validation_status: AddressValidationStatus;
  package_plan: BuiltShippingPackage[];
  available_options: ShippingQuoteOption[];
  selected_option_id: string | null;
  selected_option: ShippingQuoteOption | null;
  provider: string | null;
  quote_status: "open" | "reserved" | "expired" | "converted" | "cancelled";
  untracked_shipping_acknowledged: boolean;
  expires_at: string;
  used_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ShippingCartItem = {
  productId: string;
  variantKey?: string;
  name: string;
  quantity: number;
  shippingClass: ShippingClass | "";
  shippingEnabled: boolean;
  localPickupEnabled: boolean;
  packedWeightOz: number | null;
  packedLengthIn: number | null;
  packedWidthIn: number | null;
  packedHeightIn: number | null;
  shipsAlone: boolean;
  expeditedRequired: boolean;
  allowGroundAdvantage: boolean;
  freeShippingEligible: boolean;
  shippingSurchargeCents: number;
  maxQuantityPerPackage: number;
  preferredPackageId: string;
};

export type ShippingPackageItem = {
  productId: string;
  variantKey?: string;
  name: string;
  quantity: number;
  shippingClass: ShippingClass;
};

export type BuiltShippingPackage = {
  packageIndex: number;
  packageKey: string;
  items: ShippingPackageItem[];
  shippingClasses: ShippingClass[];
  packagePresetId: string | null;
  packagePresetCode: string | null;
  weightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  shipsAlone: boolean;
  containsTree: boolean;
};

export type PackagePlanResult = {
  packages: BuiltShippingPackage[];
  ignoredDigitalItems: ShippingCartItem[];
  pickupOnlyItems: ShippingCartItem[];
  errors: string[];
};

export type ShippingMethodOption = {
  methodCode: ShippingMethodCode;
  displayName: string;
  amountCents: number | null;
  currency: "usd";
  provider: ShippingProviderName;
  rateMode: ShippingRateMode;
  trackingIncluded: boolean;
  packageCount: number;
  warningText?: string;
  requiresUntrackedAcknowledgement?: boolean;
  checkoutSupported: boolean;
};

export type ShippingRuleEvaluation = {
  hasPhysicalItems: boolean;
  hasShippablePhysicalItems: boolean;
  hasTree: boolean;
  hasPickupOnlyItem: boolean;
  localPickupEligible: boolean;
  digitalOnly: boolean;
  availableMethods: ShippingMethodOption[];
  packageErrors: string[];
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
