"use client";

import { useEffect, useRef } from "react";
import { trackShopAnalyticsEvent } from "@/lib/analytics/shop-analytics";
import {
  summarizeGa4PurchasePayload,
  type Ga4PurchasePayload
} from "@/lib/marketing/purchase-event";

type PurchasePrepareResponse =
  | { status: "ready"; payload: Ga4PurchasePayload }
  | { status: "pending" | "duplicate" | "ineligible"; reason?: string }
  | { error: string };

type PurchaseAcknowledgementResponse =
  | { status: "tracked"; transactionId: string; trackedAt: string }
  | { status: "pending" | "duplicate" | "ineligible"; reason?: string }
  | { error: string };

type Ga4PurchaseTrackerProps = {
  sessionId?: string | null;
};

const MAX_ORDER_LOOKUP_ATTEMPTS = 8;
const ORDER_LOOKUP_DELAY_MS = 1_500;
const GOOGLE_TAG_WAIT_ATTEMPTS = 20;
const GOOGLE_TAG_WAIT_MS = 250;
const PURCHASE_EVENT_ATTEMPTS = 2;
const PURCHASE_EVENT_RETRY_DELAY_MS = 1_000;
const GOOGLE_EVENT_CALLBACK_TIMEOUT_MS = 2_000;
const GOOGLE_EVENT_CALLBACK_GRACE_MS = 500;

export function Ga4PurchaseTracker({ sessionId }: Ga4PurchaseTrackerProps) {
  const startedRef = useRef(false);

  useEffect(() => {
    if (!sessionId || startedRef.current) return;
    startedRef.current = true;
    const checkoutSessionId = sessionId;

    let cancelled = false;

    async function trackPurchaseWhenReady() {
      const payload = await preparePurchasePayload(checkoutSessionId, () => cancelled);
      if (cancelled) return;

      if (!payload) return;

      const googleTagReady = await waitForGoogleTag(() => cancelled);
      if (cancelled) return;
      if (!googleTagReady) {
        logPurchaseDebug("Google tag was not available; purchase was not acknowledged.", {
          transaction_id: payload.transaction_id
        });
        return;
      }

      const acceptedByGoogleTag = await sendGa4PurchaseWithRetry(payload, () => cancelled);
      if (cancelled) return;

      if (!acceptedByGoogleTag) {
        logPurchaseDebug("GA4 purchase callback did not complete; acknowledgement was not saved.", {
          transaction_id: payload.transaction_id
        });
        return;
      }

      const acknowledgement = await acknowledgePurchase(checkoutSessionId, payload.transaction_id);
      if (!acknowledgement || "error" in acknowledgement) {
        logPurchaseDebug("Purchase acknowledgement failed after GA4 callback.", {
          transaction_id: payload.transaction_id,
          error: acknowledgement && "error" in acknowledgement ? acknowledgement.error : "No response"
        });
        return;
      }

      if (acknowledgement.status === "tracked") {
        trackShopAnalyticsEvent("purchase", {
          orderId: payload.transaction_id,
          valueCents: Math.round(payload.value * 100),
          currency: payload.currency,
          metadata: {
            item_count: payload.items.reduce((sum, item) => sum + item.quantity, 0),
            shipping: payload.shipping,
            tax: payload.tax
          }
        });
        logPurchaseDebug("GA4 purchase payload sent and acknowledged.", summarizeGa4PurchasePayload(payload));
        return;
      }

      logPurchaseDebug("Purchase acknowledgement skipped.", acknowledgement);
    }

    void trackPurchaseWhenReady();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return null;
}

async function preparePurchasePayload(sessionId: string, cancelled: () => boolean) {
  for (let attempt = 1; attempt <= MAX_ORDER_LOOKUP_ATTEMPTS && !cancelled(); attempt += 1) {
    const result = await requestPurchasePrepare(sessionId);
    if (cancelled() || !result) return null;

    if ("error" in result) {
      logPurchaseDebug("Purchase preparation failed.", { error: result.error });
      return null;
    }

    if (result.status === "pending" && attempt < MAX_ORDER_LOOKUP_ATTEMPTS) {
      await delay(ORDER_LOOKUP_DELAY_MS);
      continue;
    }

    if (result.status === "ready") {
      return result.payload;
    }

    logPurchaseDebug("Purchase tracking skipped before GA4 send.", result);
    return null;
  }

  return null;
}

async function requestPurchasePrepare(sessionId: string): Promise<PurchasePrepareResponse | null> {
  try {
    const response = await fetch("/api/analytics/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "prepare", sessionId }),
      cache: "no-store"
    });

    const result = (await response.json()) as PurchasePrepareResponse;
    if (!response.ok) {
      return "error" in result ? result : { error: "Purchase preparation request failed." };
    }

    return result;
  } catch {
    return { error: "Purchase claim request could not be sent." };
  }
}

async function acknowledgePurchase(
  sessionId: string,
  transactionId: string
): Promise<PurchaseAcknowledgementResponse | null> {
  try {
    const response = await fetch("/api/analytics/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "acknowledge", sessionId, transactionId }),
      cache: "no-store"
    });

    const result = (await response.json()) as PurchaseAcknowledgementResponse;
    if (!response.ok) {
      return "error" in result ? result : { error: "Purchase acknowledgement request failed." };
    }

    return result;
  } catch {
    return { error: "Purchase acknowledgement request could not be sent." };
  }
}

async function waitForGoogleTag(cancelled: () => boolean) {
  for (let attempt = 0; attempt < GOOGLE_TAG_WAIT_ATTEMPTS; attempt += 1) {
    if (cancelled()) return false;
    if (typeof window.gtag === "function") return true;
    await delay(GOOGLE_TAG_WAIT_MS);
  }

  return typeof window.gtag === "function";
}

async function sendGa4PurchaseWithRetry(payload: Ga4PurchasePayload, cancelled: () => boolean) {
  for (let attempt = 1; attempt <= PURCHASE_EVENT_ATTEMPTS && !cancelled(); attempt += 1) {
    const accepted = await sendGa4PurchaseEvent(payload);
    if (accepted) return true;
    if (attempt < PURCHASE_EVENT_ATTEMPTS) {
      await delay(PURCHASE_EVENT_RETRY_DELAY_MS);
    }
  }

  return false;
}

function sendGa4PurchaseEvent(payload: Ga4PurchasePayload) {
  const gtag = window.gtag;
  if (typeof gtag !== "function") return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let timer: number | undefined;
    const finish = (accepted: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) window.clearTimeout(timer);
      resolve(accepted);
    };

    timer = window.setTimeout(
      () => finish(false),
      GOOGLE_EVENT_CALLBACK_TIMEOUT_MS + GOOGLE_EVENT_CALLBACK_GRACE_MS
    );

    try {
      gtag("event", "purchase", {
        ...payload,
        event_callback: () => finish(true),
        event_timeout: GOOGLE_EVENT_CALLBACK_TIMEOUT_MS
      });
    } catch {
      finish(false);
    }
  });
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function logPurchaseDebug(message: string, data: unknown) {
  if (process.env.NODE_ENV === "production") return;
  console.info(`[BCN GA4] ${message}`, data);
}
