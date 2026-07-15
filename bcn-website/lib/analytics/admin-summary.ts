export type AnalyticsEventName = "page_view" | "view_item" | "add_to_cart" | "begin_checkout" | "purchase";

export type ShopAnalyticsEventRow = {
  id: string;
  created_at: string;
  event_name: AnalyticsEventName;
  visitor_id: string | null;
  session_id: string | null;
  path: string | null;
  page_title: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  product_id: string | null;
  product_slug: string | null;
  product_name: string | null;
  variant_id: string | null;
  variant_name: string | null;
  quantity: number | null;
  value_cents: number | null;
  currency: string | null;
  order_id: string | null;
};

export type AnalyticsOrderItemRow = {
  product_id: string | null;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  line_total: number | string;
};

export type AnalyticsOrderRow = {
  id: string;
  created_at: string;
  total: number | string;
  currency: string;
  order_items?: AnalyticsOrderItemRow[];
};

export type AnalyticsSummary = ReturnType<typeof buildAnalyticsSummary>;

type ProductSummary = {
  productId: string;
  productSlug: string;
  productName: string;
  views: number;
  addToCarts: number;
  purchases: number;
  revenueCents: number;
  viewToCartRate: number;
  viewToPurchaseRate: number;
};

type SourceSummary = {
  source: string;
  visits: number;
  addToCarts: number;
  checkouts: number;
  purchases: number;
  revenueCents: number;
};

export function buildAnalyticsSummary(input: {
  events: ShopAnalyticsEventRow[];
  orders: AnalyticsOrderRow[];
  days: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - input.days * 24 * 60 * 60 * 1000);
  const events = input.events.filter((event) => new Date(event.created_at).getTime() >= since.getTime());
  const orders = input.orders.filter((order) => new Date(order.created_at).getTime() >= since.getTime());
  const dayMap = buildEmptyDayMap(since, now);
  const productMap = new Map<string, ProductSummary>();
  const sourceMap = new Map<string, SourceSummary>();
  const visitors = new Set<string>();
  const sessions = new Set<string>();

  const totals = {
    visitors: 0,
    sessions: 0,
    pageViews: 0,
    productViews: 0,
    addToCarts: 0,
    checkouts: 0,
    orders: orders.length,
    revenueCents: 0,
    checkoutToOrderRate: 0
  };

  events.forEach((event) => {
    if (event.visitor_id) visitors.add(event.visitor_id);
    if (event.session_id) sessions.add(event.session_id);

    if (event.event_name === "page_view") totals.pageViews += 1;
    if (event.event_name === "view_item") totals.productViews += 1;
    if (event.event_name === "add_to_cart") totals.addToCarts += 1;
    if (event.event_name === "begin_checkout") totals.checkouts += 1;

    const day = dayKey(event.created_at);
    const daySummary = dayMap.get(day);
    if (daySummary) {
      if (event.event_name === "page_view") daySummary.pageViews += 1;
      if (event.event_name === "view_item") daySummary.productViews += 1;
      if (event.event_name === "add_to_cart") daySummary.addToCarts += 1;
      if (event.event_name === "begin_checkout") daySummary.checkouts += 1;
    }

    if (event.event_name === "view_item" || event.event_name === "add_to_cart") {
      const product = getProductSummary(productMap, event);
      if (event.event_name === "view_item") product.views += 1;
      if (event.event_name === "add_to_cart") product.addToCarts += 1;
    }

    const source = getSourceSummary(sourceMap, classifySource(event));
    if (event.event_name === "page_view") source.visits += 1;
    if (event.event_name === "add_to_cart") source.addToCarts += 1;
    if (event.event_name === "begin_checkout") source.checkouts += 1;
    if (event.event_name === "purchase") {
      source.purchases += 1;
      source.revenueCents += Math.max(0, Number(event.value_cents) || 0);
    }
  });

  orders.forEach((order) => {
    const revenueCents = dollarsToCents(order.total);
    totals.revenueCents += revenueCents;

    const day = dayKey(order.created_at);
    const daySummary = dayMap.get(day);
    if (daySummary) {
      daySummary.orders += 1;
      daySummary.revenueCents += revenueCents;
    }

    (order.order_items ?? []).forEach((item) => {
      const product = getProductSummary(productMap, {
        product_id: item.product_id,
        product_slug: null,
        product_name: item.product_name
      });
      product.purchases += Math.max(0, Number(item.quantity) || 0);
      product.revenueCents += dollarsToCents(item.line_total);
    });
  });

  totals.visitors = visitors.size;
  totals.sessions = sessions.size;
  totals.checkoutToOrderRate = ratio(totals.orders, totals.checkouts);

  const products = Array.from(productMap.values())
    .map((product) => ({
      ...product,
      viewToCartRate: ratio(product.addToCarts, product.views),
      viewToPurchaseRate: ratio(product.purchases, product.views)
    }))
    .sort((a, b) => b.views - a.views || b.addToCarts - a.addToCarts || b.purchases - a.purchases)
    .slice(0, 12);

  const sources = Array.from(sourceMap.values())
    .sort((a, b) => b.visits - a.visits || b.addToCarts - a.addToCarts)
    .slice(0, 10);

  return {
    days: input.days,
    since: since.toISOString(),
    generatedAt: now.toISOString(),
    totals,
    funnel: [
      { label: "Page views", count: totals.pageViews },
      { label: "Product views", count: totals.productViews },
      { label: "Add to carts", count: totals.addToCarts },
      { label: "Checkouts", count: totals.checkouts },
      { label: "Orders", count: totals.orders }
    ],
    byDay: Array.from(dayMap.values()),
    products,
    sources,
    recentEvents: events
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 12)
      .map((event) => ({
        id: event.id,
        createdAt: event.created_at,
        eventName: event.event_name,
        path: event.path ?? "",
        productName: event.product_name ?? "",
        source: classifySource(event)
      }))
  };
}

function buildEmptyDayMap(since: Date, now: Date) {
  const map = new Map<string, {
    date: string;
    pageViews: number;
    productViews: number;
    addToCarts: number;
    checkouts: number;
    orders: number;
    revenueCents: number;
  }>();
  const cursor = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  while (cursor.getTime() <= end.getTime()) {
    const date = cursor.toISOString().slice(0, 10);
    map.set(date, { date, pageViews: 0, productViews: 0, addToCarts: 0, checkouts: 0, orders: 0, revenueCents: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return map;
}

function dayKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function getProductSummary(map: Map<string, ProductSummary>, input: {
  product_id: string | null;
  product_slug: string | null;
  product_name: string | null;
}) {
  const key = input.product_id || input.product_slug || input.product_name || "unknown";
  const current = map.get(key);
  if (current) return current;

  const next = {
    productId: input.product_id ?? "",
    productSlug: input.product_slug ?? "",
    productName: input.product_name ?? "Unknown product",
    views: 0,
    addToCarts: 0,
    purchases: 0,
    revenueCents: 0,
    viewToCartRate: 0,
    viewToPurchaseRate: 0
  };
  map.set(key, next);
  return next;
}

function getSourceSummary(map: Map<string, SourceSummary>, source: string) {
  const current = map.get(source);
  if (current) return current;

  const next = { source, visits: 0, addToCarts: 0, checkouts: 0, purchases: 0, revenueCents: 0 };
  map.set(source, next);
  return next;
}

function classifySource(event: Pick<ShopAnalyticsEventRow, "utm_source" | "utm_campaign" | "referrer">) {
  if (event.utm_source) {
    return event.utm_campaign ? `${event.utm_source} / ${event.utm_campaign}` : event.utm_source;
  }

  if (!event.referrer) return "Direct / unknown";

  try {
    const host = new URL(event.referrer).hostname.replace(/^www\./, "");
    if (host.includes("basecampnorthpa.com")) return "Internal";
    return host;
  } catch {
    return "Referral";
  }
}

function dollarsToCents(value: number | string) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.round(numberValue * 100) : 0;
}

function ratio(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}
