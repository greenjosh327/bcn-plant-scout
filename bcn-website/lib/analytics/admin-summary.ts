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
  cartToPurchaseRate: number;
  dropOffCount: number;
  dropOffRate: number;
  abandonedCarts: number;
};

type SourceSummary = {
  source: string;
  visits: number;
  addToCarts: number;
  checkouts: number;
  purchases: number;
  revenueCents: number;
};

type LandingPageSummary = {
  path: string;
  title: string;
  entries: number;
  visitors: number;
  sessions: number;
  productViews: number;
  addToCarts: number;
  checkouts: number;
  purchases: number;
  revenueCents: number;
};

type LandingPageAccumulator = Omit<LandingPageSummary, "visitors" | "sessions"> & {
  visitorIds: Set<string>;
  sessionIds: Set<string>;
};

type SourceDetailSummary = {
  source: string;
  medium: string;
  campaign: string;
  referrer: string;
  visits: number;
  addToCarts: number;
  checkouts: number;
  purchases: number;
  revenueCents: number;
};

type VisitorAccumulator = {
  visitorId: string;
  sessionIds: Set<string>;
  days: Set<string>;
};

export function buildAnalyticsSummary(input: {
  events: ShopAnalyticsEventRow[];
  orders: AnalyticsOrderRow[];
  days?: number;
  since?: Date;
  until?: Date;
  rangeLabel?: string;
  timeZone?: string;
  knownReturningVisitorIds?: string[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const days = input.days ?? 30;
  const since = input.since ?? new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const until = input.until ?? now;
  const timeZone = input.timeZone ?? "UTC";
  const events = input.events.filter((event) => isWithinRange(event.created_at, since, until));
  const orders = input.orders.filter((order) => isWithinRange(order.created_at, since, until));
  const dayMap = buildEmptyDayMap(since, until, timeZone);
  const productMap = new Map<string, ProductSummary>();
  const sourceMap = new Map<string, SourceSummary>();
  const sourceDetailMap = new Map<string, SourceDetailSummary>();
  const landingPageMap = new Map<string, LandingPageAccumulator>();
  const landingPageByJourney = new Map<string, string>();
  const visitorMap = new Map<string, VisitorAccumulator>();
  const knownReturningVisitorIds = new Set(input.knownReturningVisitorIds ?? []);
  const visitors = new Set<string>();
  const sessions = new Set<string>();
  const eventsAscending = events
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

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

  eventsAscending.forEach((event) => {
    if (event.visitor_id) visitors.add(event.visitor_id);
    if (event.session_id) sessions.add(event.session_id);
    recordVisitor(visitorMap, event, timeZone);
    recordLandingPageEntry(landingPageMap, landingPageByJourney, event);

    if (event.event_name === "page_view") totals.pageViews += 1;
    if (event.event_name === "view_item") totals.productViews += 1;
    if (event.event_name === "add_to_cart") totals.addToCarts += 1;
    if (event.event_name === "begin_checkout") totals.checkouts += 1;

    const day = dayKey(event.created_at, timeZone);
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
    const sourceDetail = getSourceDetailSummary(sourceDetailMap, getSourceDetail(event));
    if (event.event_name === "page_view") source.visits += 1;
    if (event.event_name === "add_to_cart") source.addToCarts += 1;
    if (event.event_name === "begin_checkout") source.checkouts += 1;
    if (event.event_name === "purchase") {
      source.purchases += 1;
      source.revenueCents += Math.max(0, Number(event.value_cents) || 0);
    }

    if (event.event_name === "page_view") sourceDetail.visits += 1;
    if (event.event_name === "add_to_cart") sourceDetail.addToCarts += 1;
    if (event.event_name === "begin_checkout") sourceDetail.checkouts += 1;
    if (event.event_name === "purchase") {
      sourceDetail.purchases += 1;
      sourceDetail.revenueCents += Math.max(0, Number(event.value_cents) || 0);
    }

    const landingPage = getLandingPageForEvent(landingPageMap, landingPageByJourney, event);
    if (landingPage) {
      if (event.event_name === "view_item") landingPage.productViews += 1;
      if (event.event_name === "add_to_cart") landingPage.addToCarts += 1;
      if (event.event_name === "begin_checkout") landingPage.checkouts += 1;
      if (event.event_name === "purchase") {
        landingPage.purchases += 1;
        landingPage.revenueCents += Math.max(0, Number(event.value_cents) || 0);
      }
    }
  });

  orders.forEach((order) => {
    const revenueCents = dollarsToCents(order.total);
    totals.revenueCents += revenueCents;

    const day = dayKey(order.created_at, timeZone);
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

  const productSummaries = Array.from(productMap.values())
    .map((product) => ({
      ...product,
      viewToCartRate: ratio(product.addToCarts, product.views),
      viewToPurchaseRate: ratio(product.purchases, product.views),
      cartToPurchaseRate: ratio(product.purchases, product.addToCarts),
      dropOffCount: Math.max(0, product.views - product.addToCarts),
      dropOffRate: product.views ? ratio(product.views - product.addToCarts, product.views) : 0,
      abandonedCarts: Math.max(0, product.addToCarts - product.purchases)
    }));

  const products = productSummaries
    .slice()
    .sort((a, b) => b.views - a.views || b.addToCarts - a.addToCarts || b.purchases - a.purchases)
    .slice(0, 12);

  const sources = Array.from(sourceMap.values())
    .sort((a, b) => b.visits - a.visits || b.addToCarts - a.addToCarts)
    .slice(0, 10);

  const sourceDetails = Array.from(sourceDetailMap.values())
    .sort((a, b) => b.visits - a.visits || b.addToCarts - a.addToCarts || b.purchases - a.purchases)
    .slice(0, 12);

  const landingPages = Array.from(landingPageMap.values())
    .map<LandingPageSummary>((page) => ({
      path: page.path,
      title: page.title,
      entries: page.entries,
      visitors: page.visitorIds.size,
      sessions: page.sessionIds.size || page.entries,
      productViews: page.productViews,
      addToCarts: page.addToCarts,
      checkouts: page.checkouts,
      purchases: page.purchases,
      revenueCents: page.revenueCents
    }))
    .sort((a, b) => b.entries - a.entries || b.productViews - a.productViews || b.addToCarts - a.addToCarts)
    .slice(0, 10);

  const productDropOff = productSummaries
    .slice()
    .filter((product) => product.views > 0)
    .sort((a, b) => b.dropOffCount - a.dropOffCount || b.views - a.views)
    .slice(0, 8);

  const cartAbandonment = productSummaries
    .slice()
    .filter((product) => product.addToCarts > 0)
    .sort((a, b) => b.abandonedCarts - a.abandonedCarts || b.addToCarts - a.addToCarts)
    .slice(0, 8);

  const visitorMix = buildVisitorMix(visitorMap, knownReturningVisitorIds);

  return {
    days,
    rangeLabel: input.rangeLabel ?? `${days} days`,
    timeZone,
    since: since.toISOString(),
    until: until.toISOString(),
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
    productDropOff,
    cartAbandonment,
    sources,
    sourceDetails,
    landingPages,
    visitorMix,
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

function buildEmptyDayMap(since: Date, until: Date, timeZone: string) {
  const map = new Map<string, {
    date: string;
    pageViews: number;
    productViews: number;
    addToCarts: number;
    checkouts: number;
    orders: number;
    revenueCents: number;
  }>();
  const endDate = new Date(Math.max(since.getTime(), until.getTime() - 1));
  let cursor = dayKey(since.toISOString(), timeZone);
  const end = dayKey(endDate.toISOString(), timeZone);

  while (cursor <= end) {
    map.set(cursor, { date: cursor, pageViews: 0, productViews: 0, addToCarts: 0, checkouts: 0, orders: 0, revenueCents: 0 });
    cursor = addDays(cursor, 1);
  }

  return map;
}

function isWithinRange(value: string, since: Date, until: Date) {
  const time = new Date(value).getTime();
  return time >= since.getTime() && time < until.getTime();
}

function dayKey(value: string, timeZone: string) {
  const date = new Date(value);
  if (timeZone === "UTC") return date.toISOString().slice(0, 10);

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function addDays(dateKeyValue: string, days: number) {
  const [year, month, day] = dateKeyValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function recordVisitor(map: Map<string, VisitorAccumulator>, event: ShopAnalyticsEventRow, timeZone: string) {
  if (!event.visitor_id) return;
  const current = map.get(event.visitor_id) ?? {
    visitorId: event.visitor_id,
    sessionIds: new Set<string>(),
    days: new Set<string>()
  };

  if (event.session_id) current.sessionIds.add(event.session_id);
  current.days.add(dayKey(event.created_at, timeZone));
  map.set(event.visitor_id, current);
}

function buildVisitorMix(map: Map<string, VisitorAccumulator>, knownReturningVisitorIds: Set<string>) {
  const visitors = Array.from(map.values());
  const returningVisitors = visitors.filter(
    (visitor) =>
      knownReturningVisitorIds.has(visitor.visitorId) ||
      visitor.sessionIds.size > 1 ||
      visitor.days.size > 1
  ).length;
  const newVisitors = Math.max(0, visitors.length - returningVisitors);

  return {
    newVisitors,
    returningVisitors,
    knownReturningVisitors: visitors.filter((visitor) => knownReturningVisitorIds.has(visitor.visitorId)).length,
    totalKnownVisitors: visitors.length,
    returningRate: ratio(returningVisitors, visitors.length)
  };
}

function recordLandingPageEntry(
  map: Map<string, LandingPageAccumulator>,
  landingPageByJourney: Map<string, string>,
  event: ShopAnalyticsEventRow
) {
  if (event.event_name !== "page_view") return;

  const journeyKey = getJourneyKey(event) || event.id;
  if (landingPageByJourney.has(journeyKey)) return;

  const path = cleanPath(event.path);
  const page = getLandingPageSummary(map, path, event.page_title);
  page.entries += 1;
  if (event.visitor_id) page.visitorIds.add(event.visitor_id);
  if (event.session_id) page.sessionIds.add(event.session_id);
  landingPageByJourney.set(journeyKey, path);
}

function getLandingPageForEvent(
  map: Map<string, LandingPageAccumulator>,
  landingPageByJourney: Map<string, string>,
  event: ShopAnalyticsEventRow
) {
  const journeyKey = getJourneyKey(event);
  if (!journeyKey) return null;
  const path = landingPageByJourney.get(journeyKey);
  return path ? map.get(path) ?? null : null;
}

function getJourneyKey(event: Pick<ShopAnalyticsEventRow, "session_id" | "visitor_id">) {
  return event.session_id || event.visitor_id || "";
}

function getLandingPageSummary(map: Map<string, LandingPageAccumulator>, path: string, title: string | null) {
  const current = map.get(path);
  if (current) {
    if (!current.title && title) current.title = title;
    return current;
  }

  const next = {
    path,
    title: title ?? "",
    entries: 0,
    productViews: 0,
    addToCarts: 0,
    checkouts: 0,
    purchases: 0,
    revenueCents: 0,
    visitorIds: new Set<string>(),
    sessionIds: new Set<string>()
  };
  map.set(path, next);
  return next;
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
    viewToPurchaseRate: 0,
    cartToPurchaseRate: 0,
    dropOffCount: 0,
    dropOffRate: 0,
    abandonedCarts: 0
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

function getSourceDetailSummary(map: Map<string, SourceDetailSummary>, detail: Pick<SourceDetailSummary, "source" | "medium" | "campaign" | "referrer">) {
  const key = `${detail.source}|${detail.medium}|${detail.campaign}|${detail.referrer}`;
  const current = map.get(key);
  if (current) return current;

  const next = {
    source: detail.source,
    medium: detail.medium,
    campaign: detail.campaign,
    referrer: detail.referrer,
    visits: 0,
    addToCarts: 0,
    checkouts: 0,
    purchases: 0,
    revenueCents: 0
  };
  map.set(key, next);
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

function getSourceDetail(event: Pick<ShopAnalyticsEventRow, "utm_source" | "utm_medium" | "utm_campaign" | "referrer">) {
  const referrer = getReferrerHost(event.referrer);
  const isInternal = referrer.includes("basecampnorthpa.com");
  const source = cleanText(event.utm_source) || (isInternal ? "Internal" : referrer || "Direct / unknown");
  const medium = cleanText(event.utm_medium) || (referrer && !isInternal ? "referral" : isInternal ? "internal" : "direct");
  const campaign = cleanText(event.utm_campaign);

  return {
    source,
    medium,
    campaign,
    referrer: isInternal ? "" : referrer
  };
}

function getReferrerHost(referrer: string | null) {
  if (!referrer) return "";

  try {
    return new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function cleanPath(value: string | null) {
  if (!value) return "/";

  try {
    return new URL(value, "https://basecampnorthpa.com").pathname || "/";
  } catch {
    return value.split("?")[0] || "/";
  }
}

function cleanText(value: string | null) {
  return (value ?? "").trim();
}

function dollarsToCents(value: number | string) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.round(numberValue * 100) : 0;
}

function ratio(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}
