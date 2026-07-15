import type { Product, ProductVariation } from "@/lib/types";

export type GoogleAnalyticsItem = {
  item_id: string;
  item_name: string;
  item_category?: string;
  item_variant?: string;
  price?: number;
  quantity?: number;
};

type GoogleEventParams = Record<string, unknown>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function productToGoogleAnalyticsItem(
  product: Pick<Product, "id" | "name" | "category" | "price">,
  variation?: Pick<ProductVariation, "id" | "name" | "sku" | "price"> | null,
  quantity = 1
): GoogleAnalyticsItem {
  return {
    item_id: variation?.id || variation?.sku || product.id,
    item_name: product.name,
    item_category: product.category,
    item_variant: variation?.name,
    price: Number(variation?.price ?? product.price) || 0,
    quantity
  };
}

export function trackGoogleEvent(eventName: string, params: GoogleEventParams) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", eventName, params);
}

export function trackGooglePurchaseConversion(input: {
  value: number;
  currency: string;
  transactionId: string;
}) {
  const googleAdsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const purchaseLabel = process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_CONVERSION_LABEL;
  if (!googleAdsId || !purchaseLabel) return;

  trackGoogleEvent("conversion", {
    send_to: `${googleAdsId}/${purchaseLabel}`,
    value: input.value,
    currency: input.currency,
    transaction_id: input.transactionId
  });
}
