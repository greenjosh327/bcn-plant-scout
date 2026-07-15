"use client";

import { useEffect } from "react";
import {
  trackGoogleEvent,
  trackGooglePurchaseConversion,
  type GoogleAnalyticsItem
} from "@/lib/marketing/google-analytics";
import { trackShopAnalyticsEvent } from "@/lib/analytics/shop-analytics";

type GoogleEcommerceTrackerProps = {
  eventName: "view_item" | "purchase";
  params: {
    currency: string;
    value?: number;
    transaction_id?: string;
    tax?: number;
    shipping?: number;
    items: GoogleAnalyticsItem[];
  };
};

export function GoogleEcommerceTracker({ eventName, params }: GoogleEcommerceTrackerProps) {
  useEffect(() => {
    if (eventName === "purchase" && params.transaction_id) {
      const storageKey = `bcn-purchase-tracked:${params.transaction_id}`;
      if (window.sessionStorage.getItem(storageKey)) return;

      trackGoogleEvent("purchase", params);
      trackGooglePurchaseConversion({
        value: Number(params.value) || 0,
        currency: params.currency,
        transactionId: params.transaction_id
      });
      trackShopAnalyticsEvent("purchase", {
        orderId: params.transaction_id,
        valueCents: Math.round((Number(params.value) || 0) * 100),
        currency: params.currency,
        metadata: {
          item_count: params.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
          shipping: params.shipping ?? 0,
          tax: params.tax ?? 0
        }
      });
      window.sessionStorage.setItem(storageKey, "true");
      return;
    }

    trackGoogleEvent(eventName, params);
    if (eventName === "view_item") {
      const item = params.items[0];
      trackShopAnalyticsEvent("view_item", {
        productId: item?.item_id,
        productSlug: item?.item_slug,
        productName: item?.item_name,
        variantId: item?.variant_id,
        variantName: item?.item_variant,
        quantity: item?.quantity,
        valueCents: Math.round((Number(item?.price ?? params.value) || 0) * 100),
        currency: params.currency
      });
    }
  }, [eventName, params]);

  return null;
}
