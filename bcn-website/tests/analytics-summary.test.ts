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

test("shop analytics summary supports exact local-day ranges", () => {
  const summary = buildAnalyticsSummary({
    events: [
      event("before", "page_view", "2026-07-22T03:59:59Z", { visitor_id: "v-before", session_id: "s-before" }),
      event("start", "page_view", "2026-07-22T04:00:00Z", { visitor_id: "v1", session_id: "s1" }),
      event("middle", "view_item", "2026-07-22T18:00:00Z", { visitor_id: "v1", session_id: "s1", product_name: "Prairifire Crabapple Seeds" }),
      event("end", "add_to_cart", "2026-07-23T03:59:59Z", { visitor_id: "v2", session_id: "s2", product_name: "Prairifire Crabapple Seeds" }),
      event("after", "page_view", "2026-07-23T04:00:00Z", { visitor_id: "v-after", session_id: "s-after" })
    ],
    orders: [{
      id: "order-1",
      created_at: "2026-07-22T20:00:00Z",
      total: 5,
      currency: "usd",
      order_items: [{
        product_id: "prod_crabapple",
        product_name: "Prairifire Crabapple Seeds",
        variant_name: "25 Seeds",
        quantity: 1,
        line_total: 5
      }]
    }],
    since: new Date("2026-07-22T04:00:00Z"),
    until: new Date("2026-07-23T04:00:00Z"),
    rangeLabel: "Today",
    timeZone: "America/New_York",
    now: new Date("2026-07-23T12:00:00Z")
  });

  assert.equal(summary.rangeLabel, "Today");
  assert.equal(summary.totals.visitors, 2);
  assert.equal(summary.totals.pageViews, 1);
  assert.equal(summary.totals.productViews, 1);
  assert.equal(summary.totals.addToCarts, 1);
  assert.equal(summary.totals.orders, 1);
  assert.deepEqual(summary.byDay.map((day) => day.date), ["2026-07-22"]);
  assert.equal(summary.byDay[0].pageViews, 1);
  assert.equal(summary.byDay[0].productViews, 1);
  assert.equal(summary.byDay[0].addToCarts, 1);
  assert.equal(summary.byDay[0].orders, 1);
});

test("shop analytics summary reports landing, drop-off, abandonment, source detail, and visitor mix", () => {
  const now = new Date("2026-07-22T20:00:00Z");
  const events: ShopAnalyticsEventRow[] = [
    event("1", "page_view", "2026-07-22T13:00:00Z", {
      visitor_id: "v1",
      session_id: "s1",
      path: "/shop?utm_source=google&utm_campaign=summer",
      page_title: "Shop",
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "summer"
    }),
    event("2", "view_item", "2026-07-22T13:01:00Z", {
      visitor_id: "v1",
      session_id: "s1",
      product_id: "prod_honey",
      product_name: "Honey Locust Seeds",
      product_slug: "honey-locust-seeds",
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "summer"
    }),
    event("3", "add_to_cart", "2026-07-22T13:02:00Z", {
      visitor_id: "v1",
      session_id: "s1",
      product_id: "prod_honey",
      product_name: "Honey Locust Seeds",
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "summer"
    }),
    event("4", "page_view", "2026-07-22T14:00:00Z", {
      visitor_id: "v2",
      session_id: "s2",
      path: "/articles/native-trees",
      page_title: "Native Trees",
      referrer: "https://facebook.com/basecampnorth"
    }),
    event("5", "view_item", "2026-07-22T14:01:00Z", {
      visitor_id: "v2",
      session_id: "s2",
      product_id: "prod_chestnut",
      product_name: "Chestnut Seedling"
    }),
    event("6", "page_view", "2026-07-22T15:00:00Z", {
      visitor_id: "v3",
      session_id: "s3",
      path: "/shop",
      page_title: "Shop"
    }),
    event("7", "view_item", "2026-07-22T15:01:00Z", {
      visitor_id: "v3",
      session_id: "s3",
      product_id: "prod_crabapple",
      product_name: "Prairifire Crabapple Seeds"
    }),
    event("8", "add_to_cart", "2026-07-22T15:02:00Z", {
      visitor_id: "v3",
      session_id: "s3",
      product_id: "prod_crabapple",
      product_name: "Prairifire Crabapple Seeds"
    })
  ];
  const orders: AnalyticsOrderRow[] = [{
    id: "order-1",
    created_at: "2026-07-22T13:08:00Z",
    total: 5.99,
    currency: "usd",
    order_items: [{
      product_id: "prod_honey",
      product_name: "Honey Locust Seeds",
      variant_name: "25 Seeds",
      quantity: 1,
      line_total: 5.99
    }]
  }];

  const summary = buildAnalyticsSummary({
    events,
    orders,
    days: 7,
    knownReturningVisitorIds: ["v3"],
    now
  });

  assert.equal(summary.visitorMix.newVisitors, 2);
  assert.equal(summary.visitorMix.returningVisitors, 1);
  assert.equal(summary.visitorMix.knownReturningVisitors, 1);
  assert.equal(summary.landingPages[0].path, "/shop");
  assert.equal(summary.landingPages[0].entries, 2);
  assert.equal(summary.sourceDetails[0].source, "google");
  assert.equal(summary.sourceDetails[0].medium, "cpc");
  assert.equal(summary.sourceDetails[0].campaign, "summer");
  assert.equal(summary.productDropOff[0].productName, "Chestnut Seedling");
  assert.equal(summary.productDropOff[0].dropOffCount, 1);
  assert.equal(summary.cartAbandonment[0].productName, "Prairifire Crabapple Seeds");
  assert.equal(summary.cartAbandonment[0].abandonedCarts, 1);
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
