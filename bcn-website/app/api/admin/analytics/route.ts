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
  const days = clampDays(Number(url.searchParams.get("days") || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: events, error: eventsError }, { data: orders, error: ordersError }] = await Promise.all([
    supabase
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
      .order("created_at", { ascending: false })
      .limit(10_000),
    supabase
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
      .eq("payment_status", "paid")
      .order("created_at", { ascending: false })
  ]);

  if (eventsError || ordersError) {
    return NextResponse.json({
      error: eventsError?.message || ordersError?.message || "Analytics could not be loaded."
    }, { status: 500 });
  }

  const summary = buildAnalyticsSummary({
    events: (events ?? []) as ShopAnalyticsEventRow[],
    orders: (orders ?? []) as AnalyticsOrderRow[],
    days
  });

  return NextResponse.json({ summary });
}

function clampDays(value: number) {
  if (!Number.isFinite(value)) return 30;
  if (value <= 7) return 7;
  if (value <= 30) return 30;
  return 90;
}
