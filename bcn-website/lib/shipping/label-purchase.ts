export type LabelPurchaseStatus =
  | "not_started"
  | "purchasing"
  | "purchased"
  | "failed"
  | "not_supported"
  | "refund_pending"
  | "refunded"
  | "refund_failed"
  | "refund_rejected";

export type LabelRefundStatus =
  | "not_requested"
  | "requested"
  | "queued"
  | "pending"
  | "success"
  | "error";

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

export type LabelRefundOrder = LabelPurchaseOrder & {
  label_purchased_at?: string | null;
  label_refund_status?: LabelRefundStatus | string | null;
  label_refund_ids?: string[] | null;
  tracking_status?: string | null;
};

export type LabelPurchaseEligibility = {
  eligible: boolean;
  reason: string;
};

const RATE_PURCHASE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const LABEL_REFUND_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const USED_TRACKING_STATUSES = new Set(["TRANSIT", "DELIVERED", "RETURNED", "FAILURE"]);

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
  if (value === "refund_pending") return "Refund Pending";
  if (value === "refunded") return "Refunded";
  if (value === "refund_failed") return "Refund Failed";
  if (value === "refund_rejected") return "Refund Rejected";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatLabelRefundStatus(status: string | null | undefined) {
  const value = status || "not_requested";
  if (value === "not_requested") return "Not Requested";
  if (value === "requested") return "Requested";
  if (value === "queued") return "Queued";
  if (value === "pending") return "Pending";
  if (value === "success") return "Success";
  if (value === "error") return "Error";
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

export function getLabelRefundEligibility(order: LabelRefundOrder, now = new Date()): LabelPurchaseEligibility {
  if (order.shipping_provider !== "shippo") {
    return { eligible: false, reason: "Only Shippo labels can be voided here." };
  }

  if (!hasPurchasedShippingLabels(order)) {
    return { eligible: false, reason: "No purchased Shippo label was found for this order." };
  }

  if (order.label_purchase_status === "refund_pending") {
    return { eligible: false, reason: "A label refund is already pending for this order." };
  }

  if (order.label_purchase_status === "refunded" || order.label_refund_status === "success") {
    return { eligible: false, reason: "This label has already been refunded." };
  }

  const trackingStatus = (order.tracking_status || "").toUpperCase();
  if (USED_TRACKING_STATUSES.has(trackingStatus)) {
    return { eligible: false, reason: "Shippo labels should only be voided before the package is scanned by the carrier." };
  }

  const purchasedAt = order.label_purchased_at ? new Date(order.label_purchased_at).getTime() : NaN;
  if (!Number.isFinite(purchasedAt)) {
    return { eligible: false, reason: "Label purchase date is not available." };
  }

  if (now.getTime() - purchasedAt >= LABEL_REFUND_WINDOW_MS) {
    return { eligible: false, reason: "Shippo label refunds must be requested within 90 days of purchase." };
  }

  return { eligible: true, reason: "" };
}
