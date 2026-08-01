export type Ga4PurchaseItem = {
  item_id: string;
  item_name: string;
  price: number;
  quantity: number;
  variant_id?: string;
  item_variant?: string;
};

export type Ga4PurchasePayload = {
  transaction_id: string;
  value: number;
  tax: number;
  shipping: number;
  currency: "USD";
  coupon?: string;
  items: Ga4PurchaseItem[];
};

export type PurchaseOrderItem = {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  sku?: string | null;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number | string | null;
  line_total: number | string | null;
};

export type PurchaseOrder = {
  id: string;
  stripe_session_id: string;
  stripe_payment_intent?: string | null;
  payment_status: string;
  order_status?: string | null;
  shipping_cost: number | string | null;
  tax: number | string | null;
  total: number | string | null;
  currency: string | null;
  coupon_code?: string | null;
  ga4_purchase_tracked_at?: string | null;
  ga4_purchase_transaction_id?: string | null;
  order_items?: PurchaseOrderItem[] | null;
};

export type PurchaseEligibilityReason =
  | "eligible"
  | "already_tracked"
  | "payment_not_paid"
  | "order_cancelled_or_refunded"
  | "missing_items";

export type PurchaseAcknowledgementReason =
  | "ready_to_acknowledge"
  | "already_tracked"
  | "payment_not_paid"
  | "order_cancelled_or_refunded"
  | "missing_items"
  | "transaction_mismatch";

export function getGa4PurchaseTransactionId(order: Pick<PurchaseOrder, "id">) {
  return order.id;
}

export function getGa4PurchaseEligibility(order: PurchaseOrder): {
  eligible: boolean;
  reason: PurchaseEligibilityReason;
} {
  if (order.ga4_purchase_tracked_at) {
    return { eligible: false, reason: "already_tracked" };
  }

  if (order.payment_status !== "paid") {
    return { eligible: false, reason: "payment_not_paid" };
  }

  if (order.order_status === "cancelled" || order.order_status === "refunded") {
    return { eligible: false, reason: "order_cancelled_or_refunded" };
  }

  if (!order.order_items || order.order_items.length === 0) {
    return { eligible: false, reason: "missing_items" };
  }

  return { eligible: true, reason: "eligible" };
}

export function getGa4PurchaseAcknowledgementStatus(
  order: PurchaseOrder,
  transactionId: string | null | undefined
): {
  eligible: boolean;
  reason: PurchaseAcknowledgementReason;
} {
  const expectedTransactionId = getGa4PurchaseTransactionId(order);
  if (transactionId !== expectedTransactionId) {
    return { eligible: false, reason: "transaction_mismatch" };
  }

  if (order.ga4_purchase_tracked_at) {
    return { eligible: false, reason: "already_tracked" };
  }

  if (order.payment_status !== "paid") {
    return { eligible: false, reason: "payment_not_paid" };
  }

  if (order.order_status === "cancelled" || order.order_status === "refunded") {
    return { eligible: false, reason: "order_cancelled_or_refunded" };
  }

  if (!order.order_items || order.order_items.length === 0) {
    return { eligible: false, reason: "missing_items" };
  }

  return { eligible: true, reason: "ready_to_acknowledge" };
}

export function buildGa4PurchasePayload(order: PurchaseOrder): Ga4PurchasePayload | null {
  if (!getGa4PurchaseEligibility(order).eligible) return null;

  const coupon = cleanCouponCode(order.coupon_code);
  const payload: Ga4PurchasePayload = {
    transaction_id: getGa4PurchaseTransactionId(order),
    value: moneyNumber(order.total),
    tax: moneyNumber(order.tax),
    shipping: moneyNumber(order.shipping_cost),
    currency: "USD",
    items: order.order_items!.map((item) => {
      const quantity = positiveQuantity(item.quantity);
      const lineTotal = moneyNumber(item.line_total);
      const unitPrice = moneyNumber(item.unit_price);
      const price = unitPrice || moneyNumber(lineTotal / quantity);

      return {
        item_id: cleanText(item.product_id) || cleanText(item.sku) || item.id,
        item_name: cleanText(item.product_name) || "BCN shop item",
        variant_id: cleanText(item.variant_id) || undefined,
        item_variant: cleanText(item.variant_name) || undefined,
        price,
        quantity
      };
    })
  };

  if (coupon) payload.coupon = coupon;
  return payload;
}

export function summarizeGa4PurchasePayload(payload: Ga4PurchasePayload) {
  return {
    transaction_id: payload.transaction_id,
    value: payload.value,
    tax: payload.tax,
    shipping: payload.shipping,
    currency: payload.currency,
    coupon: payload.coupon,
    item_count: payload.items.reduce((sum, item) => sum + item.quantity, 0),
    items: payload.items.map((item) => ({
      item_id: item.item_id,
      item_name: item.item_name,
      price: item.price,
      quantity: item.quantity
    }))
  };
}

function moneyNumber(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return 0;
  return Number(numberValue.toFixed(2));
}

function positiveQuantity(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return 1;
  return Math.round(numberValue);
}

function cleanCouponCode(value: unknown) {
  return cleanText(value)?.slice(0, 120) ?? "";
}

function cleanText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}
