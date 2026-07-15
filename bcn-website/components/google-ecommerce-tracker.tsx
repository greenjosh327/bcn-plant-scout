"use client";

import { useEffect } from "react";
import {
  trackGoogleEvent,
  trackGooglePurchaseConversion,
  type GoogleAnalyticsItem
} from "@/lib/marketing/google-analytics";

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
      window.sessionStorage.setItem(storageKey, "true");
      return;
    }

    trackGoogleEvent(eventName, params);
  }, [eventName, params]);

  return null;
}
