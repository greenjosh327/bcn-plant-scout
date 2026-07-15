import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";
import type { ShopAnalyticsEventName } from "@/lib/analytics/shop-analytics";

export const runtime = "nodejs";

const ALLOWED_EVENTS = new Set<ShopAnalyticsEventName>([
  "page_view",
  "view_item",
  "add_to_cart",
  "begin_checkout",
  "purchase"
]);

type AnalyticsEventBody = {
  eventName?: string;
  event_name?: string;
  visitorId?: string;
  sessionId?: string;
  path?: string;
  pageTitle?: string;
  referrer?: string;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
    term?: string;
  };
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

export async function POST(request: Request) {
  if (!originAllowed(request)) {
    return NextResponse.json({ error: "Analytics origin is not allowed." }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 20_000) {
    return NextResponse.json({ error: "Analytics event is too large." }, { status: 413 });
  }

  let body: AnalyticsEventBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Analytics event was not valid JSON." }, { status: 400 });
  }

  const eventName = cleanText(body.eventName || body.event_name, 40) as ShopAnalyticsEventName;
  if (!ALLOWED_EVENTS.has(eventName)) {
    return NextResponse.json({ error: "Analytics event name is not supported." }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  const { error } = await supabase.from("shop_analytics_events").insert({
    event_name: eventName,
    visitor_id: cleanText(body.visitorId, 120),
    session_id: cleanText(body.sessionId, 120),
    path: cleanPath(body.path),
    page_title: cleanText(body.pageTitle, 180),
    referrer: cleanText(body.referrer, 500),
    utm_source: cleanText(body.utm?.source, 120),
    utm_medium: cleanText(body.utm?.medium, 120),
    utm_campaign: cleanText(body.utm?.campaign, 160),
    utm_content: cleanText(body.utm?.content, 160),
    utm_term: cleanText(body.utm?.term, 160),
    product_id: cleanText(body.productId, 160),
    product_slug: cleanText(body.productSlug, 220),
    product_name: cleanText(body.productName, 220),
    variant_id: cleanText(body.variantId, 160),
    variant_name: cleanText(body.variantName, 180),
    quantity: positiveIntegerOrNull(body.quantity),
    value_cents: centsOrNull(body),
    currency: cleanText(body.currency, 8)?.toLowerCase() || "usd",
    order_id: uuidOrNull(body.orderId),
    metadata: cleanMetadata(body.metadata)
  });

  if (error) {
    console.error("Shop analytics event insert failed.", {
      eventName,
      message: error.message
    });
    return NextResponse.json({ error: "Analytics event could not be saved." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function originAllowed(request: Request) {
  const originHeader = request.headers.get("origin");
  if (!originHeader) return true;

  try {
    const origin = new URL(originHeader);
    const requestUrl = new URL(request.url);
    const configuredSite = process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : null;

    return origin.host === requestUrl.host
      || origin.host === configuredSite?.host
      || origin.hostname === "localhost"
      || origin.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function cleanPath(value: unknown) {
  const text = cleanText(value, 600);
  if (!text || !text.startsWith("/")) return "/";
  return text;
}

function positiveIntegerOrNull(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return null;
  return Math.round(numberValue);
}

function centsOrNull(body: AnalyticsEventBody) {
  const cents = Number(body.valueCents);
  if (Number.isFinite(cents) && cents >= 0) return Math.round(cents);

  const dollars = Number(body.value);
  if (Number.isFinite(dollars) && dollars >= 0) return Math.round(dollars * 100);

  return null;
}

function uuidOrNull(value: unknown) {
  const text = cleanText(value, 80);
  if (!text) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function cleanMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const entries = Object.entries(value as Record<string, unknown>).slice(0, 15);
  return Object.fromEntries(
    entries
      .map(([key, entryValue]) => [key.slice(0, 60), cleanMetadataValue(entryValue)] as const)
      .filter(([, entryValue]) => entryValue !== null)
  );
}

function cleanMetadataValue(value: unknown) {
  if (typeof value === "string") return value.slice(0, 240);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return null;
}
