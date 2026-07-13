import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PACKAGE_PRESETS, DEFAULT_SHIPPING_SETTINGS } from "../lib/shipping/config";
import { buildPackagePlan } from "../lib/shipping/package-builder";
import { createShippingQuoteFingerprint } from "../lib/shipping/fingerprint";
import { buildShippingQuoteDraft, ShippingQuoteError } from "../lib/shipping/quote-builder";
import type { CheckoutCart } from "../lib/shipping/checkout-cart";
import type { ShippingCartItem, ShippingClass } from "../lib/shipping/types";

const destinationAddress = {
  name: "BCN Customer",
  street1: "123 Forest Rd",
  city: "Effort",
  state: "PA",
  zip: "18330",
  country: "US"
};

function withoutShippoToken<T>(callback: () => Promise<T>) {
  const previous = {
    SHIPPO_API_TOKEN: process.env.SHIPPO_API_TOKEN,
    SHIPPO_TOKEN: process.env.SHIPPO_TOKEN,
    SHIPPO_API_KEY: process.env.SHIPPO_API_KEY
  };
  delete process.env.SHIPPO_API_TOKEN;
  delete process.env.SHIPPO_TOKEN;
  delete process.env.SHIPPO_API_KEY;

  return callback().finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

function item(overrides: Partial<ShippingCartItem> & { shippingClass?: ShippingClass | "" } = {}): ShippingCartItem {
  const shippingClass = overrides.shippingClass ?? "seed_envelope";
  return {
    productId: "prod_test",
    name: "Test Item",
    quantity: 1,
    shippingClass,
    shippingEnabled: shippingClass !== "digital" && shippingClass !== "oversized_pickup_only",
    localPickupEnabled: true,
    packedWeightOz: shippingClass === "seed_envelope" ? 0.05 : 8,
    packedLengthIn: null,
    packedWidthIn: null,
    packedHeightIn: null,
    shipsAlone: false,
    expeditedRequired: shippingClass === "tree",
    allowGroundAdvantage: shippingClass !== "tree",
    freeShippingEligible: false,
    shippingSurchargeCents: 0,
    maxQuantityPerPackage: shippingClass === "seed_envelope" ? 12 : 1,
    preferredPackageId: shippingClass === "tree" ? "preset_tree_box_36" : shippingClass === "seed_envelope" ? "preset_seed_envelope_4x6" : "preset_small_box",
    ...overrides
  };
}

function cart(shippingItems: ShippingCartItem[]): CheckoutCart {
  return {
    lines: shippingItems.map((shippingItem) => ({
      productId: shippingItem.productId,
      variantKey: shippingItem.variantKey,
      quantity: shippingItem.quantity
    })),
    items: [],
    shippingItems,
    subtotalCents: 2500
  };
}

describe("BCN shipping quotes", () => {
  it("creates the same cart fingerprint regardless of cart line order", () => {
    const first = item({ productId: "prod_a", name: "A" });
    const second = item({ productId: "prod_b", name: "B", shippingClass: "seed_package" });
    const planA = buildPackagePlan([first, second], DEFAULT_PACKAGE_PRESETS, DEFAULT_SHIPPING_SETTINGS);
    const planB = buildPackagePlan([second, first], DEFAULT_PACKAGE_PRESETS, DEFAULT_SHIPPING_SETTINGS);

    assert.equal(
      createShippingQuoteFingerprint({ shippingItems: [first, second], packagePlan: planA, destinationAddress }),
      createShippingQuoteFingerprint({ shippingItems: [second, first], packagePlan: planB, destinationAddress })
    );
  });

  it("returns saved-quote options from configured fallback rates when Shippo is unavailable", async () => {
    await withoutShippoToken(async () => {
      const draft = await buildShippingQuoteDraft({
        cart: cart([item({ quantity: 2 })]),
        fulfillment: "shipping",
        destinationAddress,
        packagePresets: DEFAULT_PACKAGE_PRESETS,
        settings: DEFAULT_SHIPPING_SETTINGS,
        now: new Date("2026-07-13T12:00:00Z")
      });

      assert.equal(draft.addressValidationStatus, "validation_unavailable");
      assert.ok(draft.availableOptions.some((option) => option.methodCode === "economy_seed_untracked" && option.requiresUntrackedAcknowledgement));
      assert.ok(draft.availableOptions.some((option) => option.methodCode === "usps_ground_advantage" && option.provider === "flat_rate"));
    });
  });

  it("does not invent tree shipping when live rates are unavailable", async () => {
    await withoutShippoToken(async () => {
      await assert.rejects(
        buildShippingQuoteDraft({
          cart: cart([item({ shippingClass: "tree", packedWeightOz: 24, allowGroundAdvantage: false })]),
          fulfillment: "shipping",
          destinationAddress,
          packagePresets: DEFAULT_PACKAGE_PRESETS,
          settings: DEFAULT_SHIPPING_SETTINGS
        }),
        (error) => error instanceof ShippingQuoteError && /Tree shipping is temporarily unavailable/.test(error.message)
      );
    });
  });
});
