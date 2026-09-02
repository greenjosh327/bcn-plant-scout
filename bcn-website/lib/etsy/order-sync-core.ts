import { variationFingerprint } from "./inventory-allocation";
import type {
  EtsyReceipt,
  EtsyReceiptRefund,
  EtsyReceiptTransaction,
  EtsyTransactionProductData,
  EtsyTransactionVariation
} from "./types";

export const BLACK_CHERRY_PRODUCT_ID = "prod_0b70691c-58ab-45d0-b392-87f19b0433bf";

function positiveInteger(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`Etsy returned an invalid ${label}.`);
  return number;
}

function optionalIdentifier(value: unknown, allowZero = false) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= (allowZero ? 0 : 1) ? number : null;
}

function nonnegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function optionalTimestamp(...values: unknown[]) {
  const seconds = values.map(Number).find((value) => Number.isFinite(value) && value > 0);
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 250) : "";
}

function safeRefund(refund: EtsyReceiptRefund) {
  return {
    createdAt: optionalTimestamp(refund.created_timestamp),
    reason: cleanText(refund.reason),
    status: cleanText(refund.status)
  };
}

function isPersonalization(propertyId: number, questionId?: number | null) {
  return propertyId === 54 || Number(questionId) > 0;
}

function productDataOptions(productData: EtsyTransactionProductData[] | undefined) {
  return (productData || []).flatMap((property) => {
    const propertyId = Number(property.property_id);
    if (!Number.isSafeInteger(propertyId) || propertyId <= 0 || isPersonalization(propertyId)) return [];
    const name = cleanText(property.property_name) || `Option ${propertyId}`;
    return (property.values || [])
      .map(cleanText)
      .filter(Boolean)
      .map((value) => ({ propertyId, name, value }));
  });
}

function legacyVariationOptions(variations: EtsyTransactionVariation[] | undefined) {
  return (variations || []).flatMap((variation) => {
    const propertyId = Number(variation.property_id);
    if (!Number.isSafeInteger(propertyId) || propertyId <= 0 || isPersonalization(propertyId, variation.question_id)) {
      return [];
    }
    const value = cleanText(variation.formatted_value);
    if (!value) return [];
    return [{
      propertyId,
      name: cleanText(variation.formatted_name) || `Option ${propertyId}`,
      value
    }];
  });
}

export function normalizedTransactionOptions(transaction: EtsyReceiptTransaction) {
  const productOptions = productDataOptions(transaction.product_data);
  return productOptions.length > 0 ? productOptions : legacyVariationOptions(transaction.variations);
}

export function etsyTransactionVariationFingerprint(transaction: EtsyReceiptTransaction) {
  return variationFingerprint({
    sku: cleanText(transaction.sku) || null,
    options: normalizedTransactionOptions(transaction).map((option) => ({
      ...option,
      priceVaries: false,
      quantityVaries: false,
      skuVaries: false
    }))
  });
}

export function normalizeEtsyReceiptForStorage(receipt: EtsyReceipt) {
  const receiptId = positiveInteger(receipt.receipt_id, "receipt ID");
  const refunds = (receipt.refunds || []).map(safeRefund);
  const status = cleanText(receipt.status).toLowerCase();
  return {
    receipt_id: receiptId,
    status,
    is_paid: Boolean(receipt.is_paid),
    is_canceled: Boolean(receipt.is_canceled) || status === "canceled",
    is_shipped: Boolean(receipt.is_shipped),
    created_at: optionalTimestamp(receipt.created_timestamp, receipt.create_timestamp),
    updated_at: optionalTimestamp(receipt.updated_timestamp, receipt.update_timestamp),
    has_refund: refunds.length > 0 || status === "fully refunded" || status === "partially refunded",
    refunds
  };
}

export function normalizeEtsyTransactionForStorage(transaction: EtsyReceiptTransaction) {
  const options = normalizedTransactionOptions(transaction);
  const sku = cleanText(transaction.sku) || null;
  return {
    transaction_id: positiveInteger(transaction.transaction_id, "transaction ID"),
    receipt_id: positiveInteger(transaction.receipt_id, "transaction receipt ID"),
    listing_id: optionalIdentifier(transaction.listing_id, true),
    product_id: optionalIdentifier(transaction.product_id),
    sku,
    quantity: nonnegativeInteger(transaction.quantity),
    paid_at: optionalTimestamp(transaction.paid_timestamp),
    variation_label: options.length > 0
      ? options.map((option) => `${option.name}: ${option.value}`).join(" / ").slice(0, 500)
      : "Default offering",
    variation_fingerprint: etsyTransactionVariationFingerprint(transaction),
    variations: options
  };
}

export type ConfirmedOrderMapping = {
  listingId: number;
  etsyProductId: number;
  sku: string | null;
  variationFingerprint: string;
  bcnProductId: string;
  packsConsumed: 1 | 4;
  confirmed: boolean;
  blocked?: boolean;
};

export type PlannedOrderTransaction = {
  transactionId: number;
  status: "processed" | "duplicate" | "ignored" | "manual_review";
  physicalPacks: number;
  bcnProductId: string | null;
  reason: string;
};

export function planOrderInventoryForTesting(input: {
  receipt: ReturnType<typeof normalizeEtsyReceiptForStorage>;
  transactions: ReturnType<typeof normalizeEtsyTransactionForStorage>[];
  mappings: ConfirmedOrderMapping[];
  inventory: Record<string, number>;
  processedTransactionIds?: Set<number>;
}) {
  const inventory = { ...input.inventory };
  const processedIds = input.processedTransactionIds || new Set<number>();
  const plans: PlannedOrderTransaction[] = [];

  for (const transaction of input.transactions) {
    if (processedIds.has(transaction.transaction_id)) {
      plans.push({ transactionId: transaction.transaction_id, status: "duplicate", physicalPacks: 0, bcnProductId: null, reason: "Already processed." });
      continue;
    }
    if (!input.receipt.is_paid || !transaction.paid_at) {
      plans.push({ transactionId: transaction.transaction_id, status: "ignored", physicalPacks: 0, bcnProductId: null, reason: "Unpaid." });
      continue;
    }
    if (input.receipt.is_canceled) {
      plans.push({ transactionId: transaction.transaction_id, status: "ignored", physicalPacks: 0, bcnProductId: null, reason: "Canceled." });
      continue;
    }
    if (input.receipt.has_refund) {
      plans.push({ transactionId: transaction.transaction_id, status: "manual_review", physicalPacks: 0, bcnProductId: null, reason: "Refund present." });
      continue;
    }

    const matching = input.mappings.filter((mapping) =>
      mapping.confirmed &&
      transaction.listing_id !== null && mapping.listingId === transaction.listing_id &&
      transaction.product_id !== null && mapping.etsyProductId === transaction.product_id &&
      (mapping.sku || "") === (transaction.sku || "") &&
      mapping.variationFingerprint === transaction.variation_fingerprint
    );
    const mapping = matching.length === 1 ? matching[0] : null;
    if (!mapping || mapping.blocked || mapping.bcnProductId === BLACK_CHERRY_PRODUCT_ID) {
      plans.push({ transactionId: transaction.transaction_id, status: "manual_review", physicalPacks: 0, bcnProductId: mapping?.bcnProductId || null, reason: mapping?.blocked ? "Blocked mapping." : "No exact confirmed mapping." });
      continue;
    }

    const physicalPacks = transaction.quantity * mapping.packsConsumed;
    if ((inventory[mapping.bcnProductId] ?? 0) < physicalPacks) {
      plans.push({ transactionId: transaction.transaction_id, status: "manual_review", physicalPacks: 0, bcnProductId: mapping.bcnProductId, reason: "Insufficient physical stock." });
      continue;
    }

    inventory[mapping.bcnProductId] -= physicalPacks;
    plans.push({ transactionId: transaction.transaction_id, status: "processed", physicalPacks, bcnProductId: mapping.bcnProductId, reason: "Exact confirmed mapping." });
  }

  return { plans, resultingInventory: inventory };
}
