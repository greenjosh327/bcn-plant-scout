import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { buildAnalyticsSummary, type AnalyticsOrderRow, type ShopAnalyticsEventRow } from "@/lib/analytics/admin-summary";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = getSupabaseServiceClient();
  const admin = await requireAdmin(request, supabase);
  if ("error" in admin) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const url = new URL(request.url);
  const range = parseAnalyticsRange(url.searchParams);
  const since = range.since.toISOString();
  const until = range.until.toISOString();

  const eventsQuery = supabase
    .from("shop_analytics_events")
    .select(`
      id,
      created_at,
      event_name,
      visitor_id,
      session_id,
      path,
      page_title,
      referrer,
      utm_source,
      utm_medium,
      utm_campaign,
      product_id,
      product_slug,
      product_name,
      variant_id,
      variant_name,
      quantity,
      value_cents,
      currency,
      order_id
    `)
    .gte("created_at", since)
    .lt("created_at", until)
    .order("created_at", { ascending: false })
    .limit(10_000);

  const ordersQuery = supabase
    .from("orders")
    .select(`
      id,
      created_at,
      total,
      currency,
      order_items (
        product_id,
        product_name,
        variant_name,
        quantity,
        line_total
      )
    `)
    .gte("created_at", since)
    .lt("created_at", until)
    .eq("payment_status", "paid")
    .order("created_at", { ascending: false });

  const [{ data: events, error: eventsError }, { data: orders, error: ordersError }] = await Promise.all([
    eventsQuery,
    ordersQuery
  ]);

  if (eventsError || ordersError) {
    return NextResponse.json({
      error: eventsError?.message || ordersError?.message || "Analytics could not be loaded."
    }, { status: 500 });
  }

  const eventRows = (events ?? []) as ShopAnalyticsEventRow[];
  const knownReturningVisitorIds = await loadKnownReturningVisitorIds(supabase, eventRows, since);

  const summary = buildAnalyticsSummary({
    events: eventRows,
    orders: (orders ?? []) as AnalyticsOrderRow[],
    days: range.days,
    since: range.since,
    until: range.until,
    rangeLabel: range.label,
    timeZone: range.timeZone,
    knownReturningVisitorIds
  });

  return NextResponse.json({ summary });
}

function clampDays(value: number) {
  if (!Number.isFinite(value)) return 30;
  if (value <= 7) return 7;
  if (value <= 30) return 30;
  return 90;
}

function parseAnalyticsRange(searchParams: URLSearchParams) {
  const timeZone = getSafeTimeZone(searchParams.get("timeZone"));
  const from = parseDateParam(searchParams.get("from"));
  const to = parseDateParam(searchParams.get("to"));
  const maxRangeMs = 90 * 24 * 60 * 60 * 1000;

  if (from && to && to.getTime() > from.getTime()) {
    const cappedTo = new Date(Math.min(to.getTime(), from.getTime() + maxRangeMs));
    return {
      days: Math.max(1, Math.ceil((cappedTo.getTime() - from.getTime()) / (24 * 60 * 60 * 1000))),
      since: from,
      until: cappedTo,
      label: cleanRangeLabel(searchParams.get("label")) || "Selected day",
      timeZone
    };
  }

  const days = clampDays(Number(searchParams.get("days") || 30));
  const now = new Date();
  return {
    days,
    since: new Date(now.getTime() - days * 24 * 60 * 60 * 1000),
    until: now,
    label: `${days} days`,
    timeZone
  };
}

function parseDateParam(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getSafeTimeZone(value: string | null) {
  const timeZone = value || "America/New_York";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "America/New_York";
  }
}

function cleanRangeLabel(value: string | null) {
  return (value ?? "").replace(/[^\w\s/-]/g, "").trim().slice(0, 40);
}

async function loadKnownReturningVisitorIds(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  events: ShopAnalyticsEventRow[],
  beforeIso: string
) {
  const visitorIds = Array.from(new Set(events.map((event) => event.visitor_id).filter((id): id is string => Boolean(id)))).slice(0, 5_000);
  if (visitorIds.length === 0) return [];

  const { data, error } = await supabase
    .from("shop_analytics_events")
    .select("visitor_id")
    .in("visitor_id", visitorIds)
    .lt("created_at", beforeIso)
    .not("visitor_id", "is", null)
    .limit(10_000);

  if (error || !data) return [];

  return Array.from(new Set(data.map((row) => row.visitor_id).filter((id): id is string => Boolean(id))));
}
