import assert from "node:assert/strict";
import test from "node:test";
import { buildAnalyticsSummary, type AnalyticsOrderRow, type ShopAnalyticsEventRow } from "@/lib/analytics/admin-summary";

test("shop analytics summary combines events and paid order data", () => {
  const now = new Date("2026-07-15T12:00:00Z");
  const events: ShopAnalyticsEventRow[] = [
    event("1", "page_view", "2026-07-15T10:00:00Z", { visitor_id: "v1", session_id: "s1", path: "/shop", utm_source: "google" }),
    event("2", "view_item", "2026-07-15T10:01:00Z", { visitor_id: "v1", session_id: "s1", product_id: "prod_honey", product_name: "Honey Locust Seeds", product_slug: "honey-locust-seeds" }),
    event("3", "add_to_cart", "2026-07-15T10:02:00Z", { visitor_id: "v1", session_id: "s1", product_id: "prod_honey", product_name: "Honey Locust Seeds" }),
    event("4", "begin_checkout", "2026-07-15T10:03:00Z", { visitor_id: "v1", session_id: "s1" }),
    event("5", "purchase", "2026-07-15T10:04:00Z", { visitor_id: "v1", session_id: "s1", value_cents: 799, order_id: "order-1" })
  ];
  const orders: AnalyticsOrderRow[] = [{
    id: "order-1",
    created_at: "2026-07-15T10:05:00Z",
    total: 7.99,
    currency: "usd",
    order_items: [{
      product_id: "prod_honey",
      product_name: "Honey Locust Seeds",
      variant_name: "Pack of 25",
      quantity: 1,
      line_total: 5.99
    }]
  }];

  const summary = buildAnalyticsSummary({ events, orders, days: 7, now });

  assert.equal(summary.totals.visitors, 1);
  assert.equal(summary.totals.sessions, 1);
  assert.equal(summary.totals.pageViews, 1);
  assert.equal(summary.totals.productViews, 1);
  assert.equal(summary.totals.addToCarts, 1);
  assert.equal(summary.totals.checkouts, 1);
  assert.equal(summary.totals.orders, 1);
  assert.equal(summary.totals.revenueCents, 799);
  assert.equal(summary.products[0].productName, "Honey Locust Seeds");
  assert.equal(summary.products[0].views, 1);
  assert.equal(summary.products[0].addToCarts, 1);
  assert.equal(summary.products[0].purchases, 1);
  assert.equal(summary.sources[0].source, "google");
});

function event(
  id: string,
  event_name: ShopAnalyticsEventRow["event_name"],
  created_at: string,
  overrides: Partial<ShopAnalyticsEventRow> = {}
): ShopAnalyticsEventRow {
  return {
    id,
    created_at,
    event_name,
    visitor_id: null,
    session_id: null,
    path: null,
    page_title: null,
    referrer: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    product_id: null,
    product_slug: null,
    product_name: null,
    variant_id: null,
    variant_name: null,
    quantity: null,
    value_cents: null,
    currency: "usd",
    order_id: null,
    ...overrides
  };
}
