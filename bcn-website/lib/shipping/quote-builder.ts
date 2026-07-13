import { buildPackagePlan } from "./package-builder";
import {
  evaluateShippingRules,
  getPickupBlockMessage,
  getShippingBlockMessage,
  getShippingExtras
} from "./rules";
import { normalizeShippingAddress, isCompleteShippingAddress, type ShippingAddressInput } from "./address";
import { createShippingQuoteFingerprint } from "./fingerprint";
import { getShippoQuoteRates, type LiveShippingRate, type ShippoQuoteResult } from "./shippo-provider";
import type { CheckoutCart } from "./checkout-cart";
import type {
  AddressValidationStatus,
  BuiltShippingPackage,
  ShippingMethodCode,
  ShippingMethodOption,
  ShippingPackagePreset,
  ShippingQuoteOption,
  ShippingSettings
} from "./types";

type Fulfillment = "pickup" | "shipping";

export class ShippingQuoteError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ShippingQuoteError";
    this.status = status;
  }
}

export type ShippingQuoteDraft = {
  cartFingerprint: string;
  customerEmail: string | null;
  destinationAddress: ReturnType<typeof normalizeShippingAddress>;
  validatedAddress: Record<string, unknown>;
  addressValidationStatus: AddressValidationStatus;
  packagePlan: BuiltShippingPackage[];
  availableOptions: ShippingQuoteOption[];
  provider: string | null;
  expiresAt: string;
  messages: string[];
};

const LIVE_METHOD_CODES = new Set<ShippingMethodCode>([
  "usps_ground_advantage",
  "usps_priority",
  "usps_priority_express"
]);

function quoteOptionFromMethod(option: ShippingMethodOption): ShippingQuoteOption | null {
  if (typeof option.amountCents !== "number") return null;
  if (!option.checkoutSupported) return null;

  return {
    ...option,
    id: option.methodCode,
    amountCents: option.amountCents
  };
}

function cheapestRate(rates: LiveShippingRate[]) {
  return rates.reduce<LiveShippingRate | null>((best, rate) => {
    if (!best || rate.amountCents < best.amountCents) return rate;
    return best;
  }, null);
}

function buildLiveOption(input: {
  option: ShippingMethodOption;
  packagePlan: BuiltShippingPackage[];
  shippoResult: ShippoQuoteResult;
  settings: ShippingSettings;
  extrasCents: number;
}): ShippingQuoteOption | null {
  if (!LIVE_METHOD_CODES.has(input.option.methodCode)) return null;
  if (input.packagePlan.length === 0) return null;
  if (input.shippoResult.packageRates.length !== input.packagePlan.length) return null;

  const allowed = new Set(input.settings.allowedUspsServiceLevels);
  const selectedRates: LiveShippingRate[] = [];

  for (const pkg of input.packagePlan) {
    const packageRates = input.shippoResult.packageRates.find((group) => group.packageKey === pkg.packageKey);
    if (!packageRates) return null;
    const candidates = packageRates.rates.filter((rate) =>
      rate.methodCode === input.option.methodCode
      && allowed.has(rate.serviceToken)
      && rate.currency === "usd"
    );
    const selected = cheapestRate(candidates);
    if (!selected) return null;
    selectedRates.push(selected);
  }

  const serviceNames = Array.from(new Set(selectedRates.map((rate) => rate.serviceName).filter(Boolean)));
  const estimatedDays = selectedRates
    .map((rate) => rate.estimatedDays)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const durationTerms = selectedRates.map((rate) => rate.durationTerms).find(Boolean);

  return {
    ...input.option,
    id: input.option.methodCode,
    amountCents: selectedRates.reduce((sum, rate) => sum + rate.amountCents, 0) + input.extrasCents,
    provider: "shippo",
    rateMode: "live_rate_required",
    checkoutSupported: true,
    carrier: "USPS",
    serviceName: serviceNames.join(" + ") || input.option.displayName,
    serviceToken: input.option.methodCode,
    shippoRateIds: selectedRates.map((rate) => rate.rateId),
    shippoShipmentIds: selectedRates.map((rate) => rate.shipmentId),
    estimatedDays: estimatedDays.length > 0 ? Math.max(...estimatedDays) : null,
    durationTerms
  };
}

function uniqueProviders(options: ShippingQuoteOption[]) {
  const providers = Array.from(new Set(options.map((option) => option.provider)));
  return providers.length > 0 ? providers.join(",") : null;
}

function customerEmail(email: string | null | undefined) {
  const trimmed = email?.trim() ?? "";
  return trimmed || null;
}

async function maybeGetShippoRates(input: {
  fulfillment: Fulfillment;
  hasPhysicalShipping: boolean;
  destinationAddress: ReturnType<typeof normalizeShippingAddress>;
  packagePlan: BuiltShippingPackage[];
  settings: ShippingSettings;
}) {
  if (input.fulfillment !== "shipping" || !input.hasPhysicalShipping || input.packagePlan.length === 0) {
    return null;
  }

  return getShippoQuoteRates({
    destinationAddress: input.destinationAddress,
    packages: input.packagePlan,
    settings: input.settings
  });
}

export async function buildShippingQuoteDraft(input: {
  cart: CheckoutCart;
  fulfillment: Fulfillment;
  destinationAddress?: ShippingAddressInput | null;
  email?: string | null;
  packagePresets: ShippingPackagePreset[];
  settings: ShippingSettings;
  now?: Date;
}): Promise<ShippingQuoteDraft> {
  const fulfillment = input.fulfillment === "shipping" ? "shipping" : "pickup";
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + input.settings.quoteExpirationMinutes * 60 * 1000).toISOString();
  const destinationAddress = normalizeShippingAddress(input.destinationAddress);
  const packagePlanResult = buildPackagePlan(input.cart.shippingItems, input.packagePresets, input.settings);
  const rules = evaluateShippingRules(input.cart.shippingItems, packagePlanResult, input.settings, input.cart.subtotalCents);
  const hasPhysicalShipping = rules.hasPhysicalItems && !rules.digitalOnly;
  const messages: string[] = [];

  if (rules.digitalOnly) {
    const option = rules.availableMethods.find((method) => method.methodCode === "digital_delivery");
    const quoteOption = option ? quoteOptionFromMethod(option) : null;
    if (!quoteOption) throw new ShippingQuoteError("Digital delivery is not available for this cart.");

    return {
      cartFingerprint: createShippingQuoteFingerprint({
        shippingItems: input.cart.shippingItems,
        packagePlan: packagePlanResult,
        destinationAddress: {}
      }),
      customerEmail: customerEmail(input.email),
      destinationAddress,
      validatedAddress: {},
      addressValidationStatus: "not_required",
      packagePlan: packagePlanResult.packages,
      availableOptions: [quoteOption],
      provider: quoteOption.provider,
      expiresAt,
      messages
    };
  }

  if (fulfillment === "pickup") {
    const pickupError = getPickupBlockMessage(rules);
    if (pickupError) throw new ShippingQuoteError(pickupError);
    const option = rules.availableMethods.find((method) => method.methodCode === "local_pickup");
    const quoteOption = option ? quoteOptionFromMethod(option) : null;
    if (!quoteOption) throw new ShippingQuoteError("Local pickup is not available for this cart.");

    return {
      cartFingerprint: createShippingQuoteFingerprint({
        shippingItems: input.cart.shippingItems,
        packagePlan: packagePlanResult,
        destinationAddress: {}
      }),
      customerEmail: customerEmail(input.email),
      destinationAddress,
      validatedAddress: {},
      addressValidationStatus: "not_required",
      packagePlan: packagePlanResult.packages,
      availableOptions: [quoteOption],
      provider: quoteOption.provider,
      expiresAt,
      messages
    };
  }

  if (!isCompleteShippingAddress(destinationAddress)) {
    throw new ShippingQuoteError("Enter a complete shipping address before requesting shipping options.");
  }

  const shippoResult = await maybeGetShippoRates({
    fulfillment,
    hasPhysicalShipping,
    destinationAddress,
    packagePlan: packagePlanResult.packages,
    settings: input.settings
  });

  if (shippoResult?.validationStatus === "invalid") {
    throw new ShippingQuoteError("The shipping address could not be validated. Please check it and try again.");
  }

  const shippingMethods = rules.availableMethods.filter((method) =>
    method.methodCode !== "local_pickup" && method.methodCode !== "digital_delivery"
  );
  const extrasCents = getShippingExtras(input.cart.shippingItems, input.settings, input.cart.subtotalCents);
  const liveOptions = new Map<ShippingMethodCode, ShippingQuoteOption>();

  if (shippoResult) {
    for (const method of shippingMethods) {
      const option = buildLiveOption({
        option: method,
        packagePlan: packagePlanResult.packages,
        shippoResult,
        settings: input.settings,
        extrasCents
      });
      if (option) liveOptions.set(method.methodCode, option);
    }
  }

  const availableOptions = shippingMethods
    .map((method) => liveOptions.get(method.methodCode) ?? quoteOptionFromMethod(method))
    .filter((option): option is ShippingQuoteOption => Boolean(option));

  if (availableOptions.length === 0) {
    throw new ShippingQuoteError(getShippingBlockMessage(rules));
  }

  if (shippoResult?.validationStatus === "validation_unavailable" && shippingMethods.some((method) => method.rateMode === "live_rate_required")) {
    messages.push("Live USPS rates are temporarily unavailable. Eligible fallback shipping options are shown when allowed.");
  }

  return {
    cartFingerprint: createShippingQuoteFingerprint({
      shippingItems: input.cart.shippingItems,
      packagePlan: packagePlanResult,
      destinationAddress
    }),
    customerEmail: customerEmail(input.email),
    destinationAddress,
    validatedAddress: shippoResult?.validatedAddress && Object.keys(shippoResult.validatedAddress).length > 0 ? shippoResult.validatedAddress : {},
    addressValidationStatus: shippoResult?.validationStatus ?? "validation_unavailable",
    packagePlan: packagePlanResult.packages,
    availableOptions,
    provider: uniqueProviders(availableOptions),
    expiresAt,
    messages
  };
}
