import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatLabelPurchaseStatus,
  formatLabelRefundStatus,
  getLabelPurchaseEligibility,
  getLabelRefundEligibility,
  hasPurchasedShippingLabels
} from "../lib/shipping/label-purchase";

const baseOrder = {
  created_at: "2026-07-13T12:00:00.000Z",
  payment_status: "paid",
  fulfillment_type: "shipping",
  shipping_provider: "shippo",
  shipping_method_code: "usps_ground_advantage",
  untracked_shipping_acknowledged: false,
  shippo_rate_ids: ["rate_123"],
  label_purchase_status: "not_started",
  label_transaction_ids: [],
  label_purchased_at: null,
  label_refund_status: "not_requested",
  tracking_status: null
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
    assert.equal(formatLabelPurchaseStatus("refund_pending"), "Refund Pending");
    assert.equal(formatLabelRefundStatus("not_requested"), "Not Requested");
    assert.equal(formatLabelRefundStatus("queued"), "Queued");
  });

  it("allows voiding an unused purchased Shippo label", () => {
    const result = getLabelRefundEligibility({
      ...baseOrder,
      label_purchase_status: "purchased",
      label_transaction_ids: ["txn_123"],
      label_purchased_at: "2026-07-13T12:00:00.000Z",
      tracking_status: "PRE_TRANSIT"
    }, new Date("2026-07-14T12:00:00.000Z"));

    assert.equal(result.eligible, true);
  });

  it("blocks voiding used, refunded, and expired labels", () => {
    const purchasedOrder = {
      ...baseOrder,
      label_purchase_status: "purchased",
      label_transaction_ids: ["txn_123"],
      label_purchased_at: "2026-07-13T12:00:00.000Z"
    };

    assert.match(getLabelRefundEligibility({ ...purchasedOrder, tracking_status: "TRANSIT" }).reason, /before the package is scanned/);
    assert.match(getLabelRefundEligibility({ ...purchasedOrder, label_purchase_status: "refunded" }).reason, /already been refunded/);
    assert.match(getLabelRefundEligibility(purchasedOrder, new Date("2026-10-12T12:00:01.000Z")).reason, /90 days/);
  });
});
