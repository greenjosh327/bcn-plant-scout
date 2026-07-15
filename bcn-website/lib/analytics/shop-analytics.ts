export type ShopAnalyticsEventName = "page_view" | "view_item" | "add_to_cart" | "begin_checkout" | "purchase";

export type ShopAnalyticsPayload = {
  productId?: string | null;
  productSlug?: string | null;
  productName?: string | null;
  variantId?: string | null;
  variantName?: string | null;
  quantity?: number | null;
  valueCents?: number | null;
  value?: number | null;
  currency?: string | null;
  orderId?: string | null;
  metadata?: Record<string, unknown>;
};

const VISITOR_STORAGE_KEY = "bcn-shop-visitor-id";
const SESSION_STORAGE_KEY = "bcn-shop-session-id";

export function trackShopAnalyticsEvent(eventName: ShopAnalyticsEventName, payload: ShopAnalyticsPayload = {}) {
  if (typeof window === "undefined") return;

  try {
    const body = JSON.stringify({
      eventName,
      visitorId: getStoredId(window.localStorage, VISITOR_STORAGE_KEY, "v"),
      sessionId: getStoredId(window.sessionStorage, SESSION_STORAGE_KEY, "s"),
      path: `${window.location.pathname}${window.location.search}`,
      pageTitle: document.title,
      referrer: document.referrer,
      utm: getUtmParams(window.location.search),
      ...payload
    });

    void fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true
    }).catch(() => undefined);
  } catch {
    // Analytics should never interrupt shopping.
  }
}

function getStoredId(storage: Storage, key: string, prefix: string) {
  const current = storage.getItem(key);
  if (current) return current;

  const next = `${prefix}_${randomId()}`;
  storage.setItem(key, next);
  return next;
}

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function getUtmParams(search: string) {
  const params = new URLSearchParams(search);
  return {
    source: params.get("utm_source") || "",
    medium: params.get("utm_medium") || "",
    campaign: params.get("utm_campaign") || "",
    content: params.get("utm_content") || "",
    term: params.get("utm_term") || ""
  };
}
