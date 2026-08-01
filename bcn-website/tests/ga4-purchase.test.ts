import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGa4PurchasePayload,
  getGa4PurchaseAcknowledgementStatus,
  getGa4PurchaseEligibility,
  getGa4PurchaseTransactionId,
  type PurchaseOrder
} from "../lib/marketing/purchase-event";

const baseOrder: PurchaseOrder = {
  id: "4ac78796-4e7f-4816-83c7-52ec605c31c7",
  stripe_session_id: "cs_test_123",
  stripe_payment_intent: "pi_test_123",
  payment_status: "paid",
  order_status: "new",
  shipping_cost: 2.75,
  tax: 1.25,
  total: 14,
  currency: "usd",
  coupon_code: "SEEDS10",
  ga4_purchase_tracked_at: null,
  ga4_purchase_transaction_id: null,
  order_items: [
    {
      id: "3e8013d8-a9c7-4b35-8fbd-78b5c952be35",
      product_id: "prod_prairifire-crabapple-seeds",
      variant_id: null,
      sku: "PRAIRIFIRE-25",
      product_name: "Prairifire Crabapple Seeds",
      variant_name: null,
      quantity: 2,
      unit_price: 5,
      line_total: 10
    }
  ]
};

describe("GA4 purchase payloads", () => {
  it("builds the required GA4 ecommerce purchase payload for a paid order", () => {
    const payload = buildGa4PurchasePayload(baseOrder);

    assert.deepEqual(payload, {
      transaction_id: baseOrder.id,
      value: 14,
      tax: 1.25,
      shipping: 2.75,
      currency: "USD",
      coupon: "SEEDS10",
      items: [
        {
          item_id: "prod_prairifire-crabapple-seeds",
          item_name: "Prairifire Crabapple Seeds",
          variant_id: undefined,
          item_variant: undefined,
          price: 5,
          quantity: 2
        }
      ]
    });
  });

  it("does not build a purchase payload for unpaid, failed, canceled, or duplicate orders", () => {
    const cases: Array<[string, Partial<PurchaseOrder>, string]> = [
      ["unpaid", { payment_status: "unpaid" }, "payment_not_paid"],
      ["failed", { payment_status: "failed" }, "payment_not_paid"],
      ["canceled", { order_status: "cancelled" }, "order_cancelled_or_refunded"],
      ["duplicate", { ga4_purchase_tracked_at: "2026-08-01T12:00:00.000Z" }, "already_tracked"]
    ];

    for (const [label, patch, reason] of cases) {
      const order = { ...baseOrder, ...patch };
      assert.equal(getGa4PurchaseEligibility(order).reason, reason, label);
      assert.equal(buildGa4PurchasePayload(order), null, label);
    }
  });

  it("waits for completed order items before a purchase can be claimed", () => {
    const order = { ...baseOrder, order_items: [] };

    assert.deepEqual(getGa4PurchaseEligibility(order), {
      eligible: false,
      reason: "missing_items"
    });
    assert.equal(buildGa4PurchasePayload(order), null);
  });

  it("uses SKU as the item id when a product id is not available", () => {
    const order: PurchaseOrder = {
      ...baseOrder,
      order_items: [
        {
          ...baseOrder.order_items![0],
          product_id: null,
          sku: "FALL-SEED-PACK"
        }
      ]
    };

    assert.equal(buildGa4PurchasePayload(order)?.items[0].item_id, "FALL-SEED-PACK");
  });

  it("allows a successful GA4 event callback to be followed by a tracked acknowledgement", () => {
    const transactionId = getGa4PurchaseTransactionId(baseOrder);

    assert.deepEqual(getGa4PurchaseAcknowledgementStatus(baseOrder, transactionId), {
      eligible: true,
      reason: "ready_to_acknowledge"
    });
  });

  it("keeps an unacknowledged order eligible when GA is unavailable or blocked", () => {
    const firstAttempt = buildGa4PurchasePayload(baseOrder);
    const retryAttempt = buildGa4PurchasePayload(baseOrder);

    assert.ok(firstAttempt);
    assert.ok(retryAttempt);
    assert.equal(retryAttempt.transaction_id, firstAttempt.transaction_id);
    assert.equal(getGa4PurchaseEligibility(baseOrder).reason, "eligible");
  });

  it("keeps an unacknowledged order eligible if the page closes before acknowledgement", () => {
    const closedBeforeAckOrder = {
      ...baseOrder,
      ga4_purchase_tracked_at: null,
      ga4_purchase_transaction_id: null
    };

    assert.equal(getGa4PurchaseEligibility(closedBeforeAckOrder).reason, "eligible");
    assert.equal(
      getGa4PurchaseAcknowledgementStatus(closedBeforeAckOrder, closedBeforeAckOrder.id).reason,
      "ready_to_acknowledge"
    );
  });

  it("suppresses refresh sends after a successful acknowledgement", () => {
    const trackedOrder: PurchaseOrder = {
      ...baseOrder,
      ga4_purchase_tracked_at: "2026-08-01T14:30:00.000Z",
      ga4_purchase_transaction_id: baseOrder.id
    };

    assert.equal(getGa4PurchaseEligibility(trackedOrder).reason, "already_tracked");
    assert.equal(buildGa4PurchasePayload(trackedOrder), null);
  });

  it("treats a repeat acknowledgement for the same transaction id as already tracked", () => {
    const trackedOrder: PurchaseOrder = {
      ...baseOrder,
      ga4_purchase_tracked_at: "2026-08-01T14:30:00.000Z",
      ga4_purchase_transaction_id: baseOrder.id
    };

    assert.deepEqual(getGa4PurchaseAcknowledgementStatus(trackedOrder, baseOrder.id), {
      eligible: false,
      reason: "already_tracked"
    });
    assert.deepEqual(getGa4PurchaseAcknowledgementStatus(baseOrder, "wrong-transaction"), {
      eligible: false,
      reason: "transaction_mismatch"
    });
  });
});
