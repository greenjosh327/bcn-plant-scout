import type { ShippingPackagePreset, ShippingSettings } from "./types";

type ShippingSettingsRow = Record<string, unknown> | null | undefined;

export const DEFAULT_SHIPPING_SETTINGS: ShippingSettings = {
  shippoEnabled: true,
  shippoMode: "live",
  allowedCarrier: "usps",
  flatRateFallbackEnabled: true,
  automaticLabelPurchase: false,
  economySeedMailCents: 175,
  trackedSeedFallbackCents: 549,
  cuttingSmallPlantFallbackCents: 999,
  treeFallbackEnabled: false,
  localPickupCents: 0,
  quoteExpirationMinutes: 20,
  handlingFeeCents: 0,
  freeShippingThresholdCents: null,
  allowedUspsServiceLevels: ["usps_ground_advantage", "usps_priority", "usps_priority_express"],
  groundAdvantageEnabled: true,
  priorityMailEnabled: true,
  priorityMailExpressEnabled: true,
  economySeedMailEnabled: true,
  maxSeedPacketsPerEconomyEnvelope: 12,
  maxEconomyEnvelopeWeightOz: 1,
  pickupDisplayLocation: "Effort, Pennsylvania",
  liveRatesMaintenanceMode: false
};

export const DEFAULT_PACKAGE_PRESETS: ShippingPackagePreset[] = [
  {
    id: "preset_seed_envelope_4x6",
    name: "Seed Envelope",
    code: "seed_envelope_4x6",
    length_in: 6,
    width_in: 4,
    height_in: 0.25,
    empty_weight_oz: 1,
    maximum_weight_oz: 1,
    allowed_shipping_classes: ["seed_envelope"],
    active: true,
    sort_order: 10
  },
  {
    id: "preset_small_padded_mailer",
    name: "Small Padded Mailer",
    code: "small_padded_mailer",
    length_in: 9,
    width_in: 6,
    height_in: 0.75,
    empty_weight_oz: 0.6,
    maximum_weight_oz: 16,
    allowed_shipping_classes: ["seed_envelope", "seed_package", "small_package", "cutting"],
    active: true,
    sort_order: 20
  },
  {
    id: "preset_small_box",
    name: "Small Box",
    code: "small_box",
    length_in: 8,
    width_in: 6,
    height_in: 4,
    empty_weight_oz: 3,
    maximum_weight_oz: 70,
    allowed_shipping_classes: ["seed_package", "small_package", "cutting", "live_plant"],
    active: true,
    sort_order: 30
  },
  {
    id: "preset_tree_box_36",
    name: "Tree Box - 36 Inch",
    code: "tree_box_36",
    length_in: 36,
    width_in: 4,
    height_in: 4,
    empty_weight_oz: 0,
    maximum_weight_oz: 1120,
    allowed_shipping_classes: ["tree"],
    active: true,
    sort_order: 40
  },
  {
    id: "preset_tree_box_48",
    name: "Tree Box - 48 Inch",
    code: "tree_box_48",
    length_in: 48,
    width_in: 4,
    height_in: 4,
    empty_weight_oz: 0,
    maximum_weight_oz: 1120,
    allowed_shipping_classes: ["tree"],
    active: true,
    sort_order: 50
  }
];

function numberFromRow(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function booleanFromRow(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function stringArrayFromRow(value: unknown, fallback: string[]) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : fallback;
}

export function normalizeShippingSettings(row: ShippingSettingsRow): ShippingSettings {
  if (!row) return DEFAULT_SHIPPING_SETTINGS;

  return {
    shippoEnabled: booleanFromRow(row.shippo_enabled, DEFAULT_SHIPPING_SETTINGS.shippoEnabled),
    shippoMode: row.shippo_mode === "test" ? "test" : "live",
    allowedCarrier: "usps",
    flatRateFallbackEnabled: booleanFromRow(row.flat_rate_fallback_enabled, DEFAULT_SHIPPING_SETTINGS.flatRateFallbackEnabled),
    automaticLabelPurchase: booleanFromRow(row.automatic_label_purchase, DEFAULT_SHIPPING_SETTINGS.automaticLabelPurchase),
    economySeedMailCents: numberFromRow(row.economy_seed_mail_cents, DEFAULT_SHIPPING_SETTINGS.economySeedMailCents),
    trackedSeedFallbackCents: numberFromRow(row.tracked_seed_fallback_cents, DEFAULT_SHIPPING_SETTINGS.trackedSeedFallbackCents),
    cuttingSmallPlantFallbackCents: numberFromRow(row.cutting_small_plant_fallback_cents, DEFAULT_SHIPPING_SETTINGS.cuttingSmallPlantFallbackCents),
    treeFallbackEnabled: booleanFromRow(row.tree_fallback_enabled, DEFAULT_SHIPPING_SETTINGS.treeFallbackEnabled),
    localPickupCents: numberFromRow(row.local_pickup_cents, DEFAULT_SHIPPING_SETTINGS.localPickupCents),
    quoteExpirationMinutes: numberFromRow(row.quote_expiration_minutes, DEFAULT_SHIPPING_SETTINGS.quoteExpirationMinutes),
    handlingFeeCents: numberFromRow(row.handling_fee_cents, DEFAULT_SHIPPING_SETTINGS.handlingFeeCents),
    freeShippingThresholdCents: row.free_shipping_threshold_cents === null ? null : numberFromRow(row.free_shipping_threshold_cents, 0),
    allowedUspsServiceLevels: stringArrayFromRow(row.allowed_usps_service_levels, DEFAULT_SHIPPING_SETTINGS.allowedUspsServiceLevels),
    groundAdvantageEnabled: booleanFromRow(row.ground_advantage_enabled, DEFAULT_SHIPPING_SETTINGS.groundAdvantageEnabled),
    priorityMailEnabled: booleanFromRow(row.priority_mail_enabled, DEFAULT_SHIPPING_SETTINGS.priorityMailEnabled),
    priorityMailExpressEnabled: booleanFromRow(row.priority_mail_express_enabled, DEFAULT_SHIPPING_SETTINGS.priorityMailExpressEnabled),
    economySeedMailEnabled: booleanFromRow(row.economy_seed_mail_enabled, DEFAULT_SHIPPING_SETTINGS.economySeedMailEnabled),
    maxSeedPacketsPerEconomyEnvelope: numberFromRow(row.max_seed_packets_per_economy_envelope, DEFAULT_SHIPPING_SETTINGS.maxSeedPacketsPerEconomyEnvelope),
    maxEconomyEnvelopeWeightOz: numberFromRow(row.max_economy_envelope_weight_oz, DEFAULT_SHIPPING_SETTINGS.maxEconomyEnvelopeWeightOz),
    pickupDisplayLocation: typeof row.pickup_display_location === "string" ? row.pickup_display_location : DEFAULT_SHIPPING_SETTINGS.pickupDisplayLocation,
    liveRatesMaintenanceMode: booleanFromRow(row.live_rates_maintenance_mode, DEFAULT_SHIPPING_SETTINGS.liveRatesMaintenanceMode)
  };
}
