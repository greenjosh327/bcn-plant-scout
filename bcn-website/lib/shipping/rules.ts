import type {
  PackagePlanResult,
  ShippingCartItem,
  ShippingMethodCode,
  ShippingMethodOption,
  ShippingRuleEvaluation,
  ShippingSettings
} from "./types";
import { SHIPPING_METHOD_LABELS } from "./types";

const ECONOMY_WARNING = "Lowest-cost option. Tracking is not included, and delivery time is not guaranteed. BCN cannot provide tracking updates for this shipping method.";
const TREE_UNAVAILABLE_MESSAGE = "Tree shipping is temporarily unavailable. Please try again shortly or select local pickup if available.";

function physicalItems(items: ShippingCartItem[]) {
  return items.filter((item) => item.shippingClass !== "digital");
}

function shippablePhysicalItems(items: ShippingCartItem[]) {
  return physicalItems(items).filter((item) => item.shippingClass !== "oversized_pickup_only" && item.shippingEnabled);
}

export function getShippingExtras(items: ShippingCartItem[], settings: ShippingSettings, subtotalCents: number) {
  const shippableItems = shippablePhysicalItems(items);
  const qualifiesForFreeShipping = settings.freeShippingThresholdCents !== null
    && subtotalCents >= settings.freeShippingThresholdCents
    && shippableItems.length > 0
    && shippableItems.every((item) => item.freeShippingEligible);

  if (qualifiesForFreeShipping) return 0;

  const surcharge = shippableItems.reduce((sum, item) => sum + Math.max(0, item.shippingSurchargeCents || 0) * item.quantity, 0);
  return surcharge + settings.handlingFeeCents;
}

function makeOption(input: {
  methodCode: ShippingMethodCode;
  amountCents: number | null;
  provider: ShippingMethodOption["provider"];
  rateMode: ShippingMethodOption["rateMode"];
  trackingIncluded: boolean;
  packageCount: number;
  checkoutSupported: boolean;
  warningText?: string;
  requiresUntrackedAcknowledgement?: boolean;
}): ShippingMethodOption {
  return {
    methodCode: input.methodCode,
    displayName: SHIPPING_METHOD_LABELS[input.methodCode],
    amountCents: input.amountCents,
    currency: "usd",
    provider: input.provider,
    rateMode: input.rateMode,
    trackingIncluded: input.trackingIncluded,
    packageCount: input.packageCount,
    checkoutSupported: input.checkoutSupported,
    warningText: input.warningText,
    requiresUntrackedAcknowledgement: input.requiresUntrackedAcknowledgement
  };
}

function hasPackagePlanForShipping(plan: PackagePlanResult) {
  return plan.errors.length === 0 && plan.packages.length > 0;
}

export function evaluateShippingRules(
  items: ShippingCartItem[],
  packagePlan: PackagePlanResult,
  settings: ShippingSettings,
  subtotalCents = 0
): ShippingRuleEvaluation {
  const physical = physicalItems(items);
  const shippable = shippablePhysicalItems(items);
  const digitalOnly = items.length > 0 && physical.length === 0;
  const hasPhysicalItems = physical.length > 0;
  const hasTree = shippable.some((item) => item.shippingClass === "tree");
  const hasPickupOnlyItem = physical.some((item) => item.shippingClass === "oversized_pickup_only" || !item.shippingEnabled);
  const localPickupEligible = physical.length > 0 && physical.every((item) => item.localPickupEnabled);
  const allPhysicalCanShip = physical.length > 0 && physical.every((item) => item.shippingClass !== "oversized_pickup_only" && item.shippingEnabled);
  const packageCount = packagePlan.packages.length;
  const extras = getShippingExtras(items, settings, subtotalCents);
  const options: ShippingMethodOption[] = [];

  if (digitalOnly) {
    options.push(makeOption({
      methodCode: "digital_delivery",
      amountCents: 0,
      provider: "digital_delivery",
      rateMode: "no_charge",
      trackingIncluded: false,
      packageCount: 0,
      checkoutSupported: true
    }));
  }

  if (localPickupEligible) {
    options.push(makeOption({
      methodCode: "local_pickup",
      amountCents: settings.localPickupCents,
      provider: "local_pickup",
      rateMode: "no_charge",
      trackingIncluded: false,
      packageCount: 0,
      checkoutSupported: true
    }));
  }

  if (!allPhysicalCanShip || !hasPackagePlanForShipping(packagePlan)) {
    return {
      hasPhysicalItems,
      hasShippablePhysicalItems: shippable.length > 0,
      hasTree,
      hasPickupOnlyItem,
      localPickupEligible,
      digitalOnly,
      availableMethods: options,
      packageErrors: packagePlan.errors
    };
  }

  const allSeedEnvelope = shippable.every((item) => item.shippingClass === "seed_envelope");
  const seedEnvelopeQuantity = shippable.reduce((sum, item) => sum + item.quantity, 0);
  const seedEnvelopeWeight = shippable.reduce((sum, item) => sum + (item.packedWeightOz ?? 0) * item.quantity, 0);
  const economyEligible = settings.economySeedMailEnabled
    && allSeedEnvelope
    && packageCount === 1
    && seedEnvelopeQuantity <= settings.maxSeedPacketsPerEconomyEnvelope
    && seedEnvelopeWeight <= settings.maxEconomyEnvelopeWeightOz;

  if (economyEligible) {
    options.push(makeOption({
      methodCode: "economy_seed_untracked",
      amountCents: settings.economySeedMailCents + extras,
      provider: "manual_usps_letter",
      rateMode: "manual_flat",
      trackingIncluded: false,
      packageCount,
      checkoutSupported: true,
      warningText: ECONOMY_WARNING,
      requiresUntrackedAcknowledgement: true
    }));
  }

  const groundEligible = settings.groundAdvantageEnabled
    && !hasTree
    && shippable.every((item) =>
      ["seed_envelope", "seed_package", "small_package", "cutting", "live_plant"].includes(item.shippingClass)
      && item.allowGroundAdvantage
      && !item.expeditedRequired
    );

  if (groundEligible) {
    const seedOnly = shippable.every((item) => item.shippingClass === "seed_envelope" || item.shippingClass === "seed_package");
    const fallback = seedOnly ? settings.trackedSeedFallbackCents : settings.cuttingSmallPlantFallbackCents;
    options.push(makeOption({
      methodCode: "usps_ground_advantage",
      amountCents: settings.flatRateFallbackEnabled ? fallback + extras : null,
      provider: settings.flatRateFallbackEnabled ? "flat_rate" : "shippo",
      rateMode: settings.flatRateFallbackEnabled ? "fallback_flat" : "live_rate_required",
      trackingIncluded: true,
      packageCount,
      checkoutSupported: settings.flatRateFallbackEnabled
    }));
  }

  if (settings.priorityMailEnabled) {
    const priorityFallbackAllowed = settings.flatRateFallbackEnabled && !hasTree && shippable.some((item) => item.expeditedRequired);
    options.push(makeOption({
      methodCode: "usps_priority",
      amountCents: priorityFallbackAllowed ? settings.cuttingSmallPlantFallbackCents + extras : null,
      provider: priorityFallbackAllowed ? "flat_rate" : "shippo",
      rateMode: priorityFallbackAllowed ? "fallback_flat" : "live_rate_required",
      trackingIncluded: true,
      packageCount,
      checkoutSupported: priorityFallbackAllowed
    }));
  }

  if (settings.priorityMailExpressEnabled) {
    options.push(makeOption({
      methodCode: "usps_priority_express",
      amountCents: null,
      provider: "shippo",
      rateMode: "live_rate_required",
      trackingIncluded: true,
      packageCount,
      checkoutSupported: false
    }));
  }

  return {
    hasPhysicalItems,
    hasShippablePhysicalItems: shippable.length > 0,
    hasTree,
    hasPickupOnlyItem,
    localPickupEligible,
    digitalOnly,
    availableMethods: options,
    packageErrors: packagePlan.errors
  };
}

export function getCheckoutShippingOptions(evaluation: ShippingRuleEvaluation) {
  return evaluation.availableMethods.filter((option) =>
    option.methodCode !== "local_pickup"
    && option.methodCode !== "digital_delivery"
    && option.checkoutSupported
    && typeof option.amountCents === "number"
  );
}

export function getShippingBlockMessage(evaluation: ShippingRuleEvaluation) {
  if (evaluation.hasTree) return TREE_UNAVAILABLE_MESSAGE;
  if (evaluation.packageErrors.length > 0) return evaluation.packageErrors[0];
  if (evaluation.hasPickupOnlyItem) return "Your cart includes pickup-only items. Remove them or choose local pickup.";
  return "No eligible shipping method is available for this cart.";
}

export function getPickupBlockMessage(evaluation: ShippingRuleEvaluation) {
  if (evaluation.digitalOnly) return "";
  if (!evaluation.localPickupEligible) return "Your cart includes an item that is not eligible for local pickup.";
  return "";
}
