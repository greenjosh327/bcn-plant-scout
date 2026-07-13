import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SHIPPING_SETTINGS } from "../lib/shipping/config";
import { buildPackagePlan } from "../lib/shipping/package-builder";
import { evaluateShippingRules, getCheckoutShippingOptions } from "../lib/shipping/rules";
import type { ShippingCartItem, ShippingClass, ShippingPackagePreset } from "../lib/shipping/types";

const presets: ShippingPackagePreset[] = [
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
    sort_order: 20
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
    sort_order: 30
  }
];

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

function evaluate(items: ShippingCartItem[]) {
  const plan = buildPackagePlan(items, presets, DEFAULT_SHIPPING_SETTINGS);
  return {
    plan,
    rules: evaluateShippingRules(items, plan, DEFAULT_SHIPPING_SETTINGS, 2500)
  };
}

describe("BCN shipping rules and package planning", () => {
  it("offers Economy Seed Mail for a seed-envelope-only cart under envelope limits", () => {
    const { plan, rules } = evaluate([item({ quantity: 2 })]);

    assert.equal(plan.errors.length, 0);
    assert.equal(plan.packages.length, 1);
    assert.ok(rules.availableMethods.some((option) => option.methodCode === "economy_seed_untracked"));
    assert.ok(rules.availableMethods.some((option) => option.methodCode === "usps_ground_advantage"));
  });

  it("removes Economy Seed Mail when seed envelopes exceed envelope quantity limits", () => {
    const { plan, rules } = evaluate([item({ quantity: 13 })]);

    assert.equal(plan.errors.length, 0);
    assert.equal(plan.packages.length, 2);
    assert.equal(rules.availableMethods.some((option) => option.methodCode === "economy_seed_untracked"), false);
    assert.ok(rules.availableMethods.some((option) => option.methodCode === "usps_ground_advantage"));
  });

  it("removes Economy Seed Mail for mixed seed envelope plus seed package carts", () => {
    const { rules } = evaluate([
      item({ productId: "prod_seed_envelope", name: "Seed Envelope", shippingClass: "seed_envelope" }),
      item({ productId: "prod_seed_package", name: "Seed Package", shippingClass: "seed_package" })
    ]);

    assert.equal(rules.availableMethods.some((option) => option.methodCode === "economy_seed_untracked"), false);
    assert.ok(rules.availableMethods.some((option) => option.methodCode === "usps_ground_advantage"));
  });

  it("allows pickup but blocks shipping checkout for pickup-only items", () => {
    const { plan, rules } = evaluate([
      item({ shippingClass: "oversized_pickup_only", shippingEnabled: false, localPickupEnabled: true, packedWeightOz: null, preferredPackageId: "" })
    ]);

    assert.equal(plan.packages.length, 0);
    assert.equal(rules.localPickupEligible, true);
    assert.equal(getCheckoutShippingOptions(rules).length, 0);
  });

  it("ignores digital-only carts for package planning", () => {
    const { plan, rules } = evaluate([
      item({ shippingClass: "digital", shippingEnabled: false, localPickupEnabled: false, packedWeightOz: null, preferredPackageId: "" })
    ]);

    assert.equal(plan.packages.length, 0);
    assert.equal(rules.digitalOnly, true);
    assert.ok(rules.availableMethods.some((option) => option.methodCode === "digital_delivery"));
  });

  it("restricts tree carts to live Priority or Express rates and no checkout fallback", () => {
    const { plan, rules } = evaluate([
      item({ shippingClass: "tree", packedWeightOz: 24, allowGroundAdvantage: false })
    ]);

    assert.equal(plan.errors.length, 0);
    assert.equal(plan.packages.length, 1);
    assert.equal(rules.availableMethods.some((option) => option.methodCode === "usps_ground_advantage"), false);
    assert.equal(rules.availableMethods.some((option) => option.methodCode === "economy_seed_untracked"), false);
    assert.ok(rules.availableMethods.some((option) => option.methodCode === "usps_priority" && option.rateMode === "live_rate_required"));
    assert.equal(getCheckoutShippingOptions(rules).length, 0);
  });

  it("uses Priority fallback for expedited non-tree items when Ground Advantage is disallowed", () => {
    const { rules } = evaluate([
      item({ shippingClass: "cutting", expeditedRequired: true, allowGroundAdvantage: false, packedWeightOz: 6 })
    ]);

    assert.equal(rules.availableMethods.some((option) => option.methodCode === "usps_ground_advantage"), false);
    assert.ok(getCheckoutShippingOptions(rules).some((option) => option.methodCode === "usps_priority" && option.amountCents === 999));
  });

  it("splits ships-alone quantities into separate packages", () => {
    const { plan } = evaluate([
      item({ shippingClass: "small_package", quantity: 2, shipsAlone: true, packedWeightOz: 8 })
    ]);

    assert.equal(plan.errors.length, 0);
    assert.equal(plan.packages.length, 2);
    assert.ok(plan.packages.every((pkg) => pkg.shipsAlone));
  });

  it("respects max quantity per package", () => {
    const { plan } = evaluate([
      item({ shippingClass: "small_package", quantity: 5, maxQuantityPerPackage: 2, packedWeightOz: 4 })
    ]);

    assert.equal(plan.errors.length, 0);
    assert.deepEqual(plan.packages.map((pkg) => pkg.items[0]?.quantity), [2, 2, 1]);
  });

  it("reports missing package setup instead of guessing", () => {
    const { plan, rules } = evaluate([
      item({ shippingClass: "live_plant", preferredPackageId: "", packedLengthIn: null, packedWidthIn: null, packedHeightIn: null })
    ]);

    assert.equal(plan.errors.length, 1);
    assert.match(plan.errors[0], /package preset or full packed dimensions/);
    assert.equal(getCheckoutShippingOptions(rules).length, 0);
  });
});
