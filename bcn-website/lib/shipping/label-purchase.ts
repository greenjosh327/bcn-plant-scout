export type LabelPurchaseStatus =
  | "not_started"
  | "purchasing"
  | "purchased"
  | "failed"
  | "not_supported"
  | "refunded";

export type LabelPurchaseOrder = {
  created_at: string;
  payment_status: string | null;
  fulfillment_type: string | null;
  shipping_provider: string | null;
  shipping_method_code: string | null;
  untracked_shipping_acknowledged?: boolean | null;
  shippo_rate_ids?: string[] | null;
  label_purchase_status?: LabelPurchaseStatus | string | null;
  label_transaction_ids?: string[] | null;
};

export type LabelPurchaseEligibility = {
  eligible: boolean;
  reason: string;
};

const RATE_PURCHASE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function cleanArray(value: string[] | null | undefined) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim().length > 0) : [];
}

export function hasPurchasedShippingLabels(order: Pick<LabelPurchaseOrder, "label_transaction_ids">) {
  return cleanArray(order.label_transaction_ids).length > 0;
}

export function formatLabelPurchaseStatus(status: string | null | undefined) {
  const value = status || "not_started";
  if (value === "not_started") return "Not Started";
  if (value === "purchasing") return "Purchasing";
  if (value === "purchased") return "Purchased";
  if (value === "failed") return "Failed";
  if (value === "not_supported") return "Not Supported";
  if (value === "refunded") return "Refunded";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getLabelPurchaseEligibility(order: LabelPurchaseOrder, now = new Date()): LabelPurchaseEligibility {
  if (order.payment_status !== "paid") {
    return { eligible: false, reason: "Payment must be paid before buying a label." };
  }

  if (order.fulfillment_type !== "shipping") {
    return { eligible: false, reason: "Pickup orders do not need shipping labels." };
  }

  if (order.shipping_provider !== "shippo") {
    return { eligible: false, reason: "Only live Shippo rate orders can buy labels here." };
  }

  if (order.shipping_method_code === "economy_seed_untracked" || order.untracked_shipping_acknowledged) {
    return { eligible: false, reason: "Economy Seed Mail is untracked and does not use Shippo labels." };
  }

  if (hasPurchasedShippingLabels(order) || order.label_purchase_status === "purchased") {
    return { eligible: false, reason: "A label has already been purchased for this order." };
  }

  if (order.label_purchase_status === "purchasing") {
    return { eligible: false, reason: "A label purchase is already in progress." };
  }

  if (cleanArray(order.shippo_rate_ids).length === 0) {
    return { eligible: false, reason: "No Shippo rate id was saved for this order." };
  }

  const createdAt = new Date(order.created_at).getTime();
  if (!Number.isFinite(createdAt)) {
    return { eligible: false, reason: "Order date is not available." };
  }

  if (now.getTime() - createdAt >= RATE_PURCHASE_WINDOW_MS) {
    return { eligible: false, reason: "Shippo rates are older than 7 days and cannot be purchased." };
  }

  return { eligible: true, reason: "" };
}
