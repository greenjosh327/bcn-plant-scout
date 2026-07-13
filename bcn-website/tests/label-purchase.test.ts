import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatLabelPurchaseStatus, getLabelPurchaseEligibility, hasPurchasedShippingLabels } from "../lib/shipping/label-purchase";

const baseOrder = {
  created_at: "2026-07-13T12:00:00.000Z",
  payment_status: "paid",
  fulfillment_type: "shipping",
  shipping_provider: "shippo",
  shipping_method_code: "usps_ground_advantage",
  untracked_shipping_acknowledged: false,
  shippo_rate_ids: ["rate_123"],
  label_purchase_status: "not_started",
  label_transaction_ids: []
};

describe("label purchase eligibility", () => {
  it("allows a paid Shippo shipping order with a saved rate", () => {
    const result = getLabelPurchaseEligibility(baseOrder, new Date("2026-07-14T12:00:00.000Z"));
    assert.equal(result.eligible, true);
  });

  it("blocks pickup, fallback, and untracked orders", () => {
    assert.match(getLabelPurchaseEligibility({ ...baseOrder, fulfillment_type: "pickup" }).reason, /Pickup/);
    assert.match(getLabelPurchaseEligibility({ ...baseOrder, shipping_provider: "flat_rate" }).reason, /Shippo/);
    assert.match(getLabelPurchaseEligibility({ ...baseOrder, shipping_method_code: "economy_seed_untracked" }).reason, /untracked/);
  });

  it("blocks duplicate purchases and old Shippo rates", () => {
    assert.equal(hasPurchasedShippingLabels({ label_transaction_ids: ["txn_123"] }), true);
    assert.match(getLabelPurchaseEligibility({ ...baseOrder, label_transaction_ids: ["txn_123"] }).reason, /already/);
    assert.match(getLabelPurchaseEligibility(baseOrder, new Date("2026-07-21T12:00:01.000Z")).reason, /older than 7 days/);
  });

  it("formats label purchase status for admin display", () => {
    assert.equal(formatLabelPurchaseStatus("not_started"), "Not Started");
    assert.equal(formatLabelPurchaseStatus("purchasing"), "Purchasing");
  });
});
