import { createHash } from "crypto";
import type { SupabaseServiceClient } from "@/lib/admin-api";
import { ETSY_API_BASE_URL, ETSY_EXPECTED_SHOP_NAME, etsyApiKeyHeader } from "./config";
import {
  forceRefreshAuthorizedEtsyAccess,
  getAuthorizedEtsyAccess,
  readEtsyErrorMessage
} from "./client";
import type { EtsyListingInventory, EtsySelf, EtsyShop } from "./types";

const SHOP_ID = 62898597;
const REFERENCE_SEED_LISTING_ID = 4579251897;
const RECOVERABLE_SNAILSEED_DRAFT_ID = 4587402614;
const CUSTOM_PACK_SIZE_PROPERTY_ID = 513;
const REQUIRED_SCOPES = ["shops_r", "listings_r", "listings_w"] as const;
const LISTING_STATES = ["active", "inactive", "sold_out", "draft", "removed", "expired"] as const;

export const SEED_PRODUCT_DRAFT_CONFIRMATION = "CREATE TWO SEED PRODUCT DRAFTS";

export const SEED_PRODUCT_DRAFTS = [
  {
    key: "carolina-snailseed",
    commonName: "Carolina Snailseed",
    scientificName: "Cocculus carolinus",
    title:
      "Carolina Snailseed Seeds (Cocculus carolinus) | Native Climbing Vine | Red Berry Wildlife Vine | Seeds for Planting",
    description: `Grow Carolina Snailseed (Cocculus carolinus), a native perennial climbing vine found across portions of the eastern and southern United States.

Carolina Snailseed produces attractive green foliage followed by clusters of bright red fruit that can persist into fall. The vine can provide cover and seasonal interest in native landscapes, woodland edges, wildlife gardens, fences, and naturalized areas.

The common name "snailseed" comes from the distinctive curved or coiled appearance of the seed.

Seed Details:
- Carolina Snailseed (Cocculus carolinus)
- 2026 harvest
- Cleaned and processed by Base Camp North
- Untreated seeds
- Seed-grown plants may naturally vary
- Sold for propagation

Growing Information:
Carolina Snailseed seeds may benefit from a period of cold, moist stratification before planting. Germination of native woody vines can be variable and may take time.

This is a climbing vine, so established plants should be provided with appropriate support or allowed to grow through a naturalized planting.

No specific germination percentage is guaranteed.

Seeds are sold for propagation and are not intended for consumption.`,
    tags: [
      "carolina snailseed",
      "snailseed seeds",
      "cocculus carolinus",
      "native vine seeds",
      "native vine",
      "wildlife garden",
      "wildlife habitat",
      "native plant seeds",
      "seeds for planting",
      "climbing vine",
      "red berry vine",
      "woodland garden",
      "native garden"
    ],
    materials: [
      "Carolina Snailseed Seeds",
      "Cocculus carolinus",
      "Untreated Seeds",
      "2026 Harvest",
      "Native Vine Seeds"
    ],
    variants: [
      { name: "25 Seeds", price: 5.99, sku: "BCN-SNAIL-25-2026", packsConsumed: 1 },
      { name: "100 Seeds", price: 12.99, sku: "BCN-SNAIL-100-2026", packsConsumed: 4 }
    ]
  },
  {
    key: "common-milkweed",
    commonName: "Common Milkweed",
    scientificName: "Asclepias syriaca",
    title:
      "Common Milkweed Seeds (Asclepias syriaca) | Native Monarch Host Plant | Pollinator & Butterfly Garden | Seeds for Planting",
    description: `Grow Common Milkweed (Asclepias syriaca), a native perennial wildflower and an important host plant for monarch butterfly caterpillars.

Common Milkweed produces clusters of fragrant pink to mauve flowers that attract a variety of pollinators. Established plants spread through underground rhizomes and can develop into colonies, making the species particularly useful for larger native gardens, meadow plantings, pollinator habitat, and wildlife areas.

Milkweed is an important component of monarch habitat because monarch caterpillars feed on milkweed plants.

Seed Details:
- Common Milkweed (Asclepias syriaca)
- 2026 harvest
- Cleaned and processed by Base Camp North
- Untreated seeds
- Seed-grown plants may naturally vary
- Sold for propagation

Growing Information:
Common Milkweed seed generally benefits from cold, moist stratification before spring planting. Seeds can also be fall-sown outdoors where natural winter conditions provide stratification.

Common Milkweed can spread once established and should be planted where its colony-forming growth habit is appropriate.

No specific germination percentage is guaranteed.

Seeds are sold for propagation and are not intended for consumption.`,
    tags: [
      "common milkweed",
      "milkweed seeds",
      "asclepias syriaca",
      "monarch host plant",
      "monarch butterfly",
      "pollinator seeds",
      "butterfly garden",
      "native wildflower",
      "native plant seeds",
      "seeds for planting",
      "pollinator garden",
      "wildlife garden",
      "meadow seeds"
    ],
    materials: [
      "Common Milkweed Seeds",
      "Asclepias syriaca",
      "Untreated Seeds",
      "2026 Harvest",
      "Native Wildflower Seeds"
    ],
    variants: [
      { name: "25 Seeds", price: 5.99, sku: "BCN-MILK-25-2026", packsConsumed: 1 },
      { name: "100 Seeds", price: 12.99, sku: "BCN-MILK-100-2026", packsConsumed: 4 }
    ]
  }
] as const;

type ListingRecord = {
  listing_id?: number;
  shop_id?: number;
  title?: string;
  description?: string;
  state?: string;
  taxonomy_id?: number | null;
  shipping_profile_id?: number | null;
  readiness_state_id?: number | null;
  return_policy_id?: number | null;
  shop_section_id?: number | null;
  item_weight?: number | null;
  item_weight_unit?: string | null;
  item_length?: number | null;
  item_width?: number | null;
  item_height?: number | null;
  item_dimensions_unit?: string | null;
  tags?: string[];
  materials?: string[];
};

type Page<T> = { count?: number; results?: T[] };
type TaxonomyNode = { id?: number; name?: string; children?: TaxonomyNode[] };
type ShippingProfile = {
  shipping_profile_id?: number;
  title?: string | null;
  profile_type?: string;
  origin_country_iso?: string;
  is_deleted?: boolean;
};
type ProcessingProfile = {
  readiness_state_id?: number;
  readiness_state?: string;
  min_processing_days?: number;
  max_processing_days?: number;
  processing_days_display_label?: string;
};
type ListingImage = { listing_image_id?: number; rank?: number };
type EtsyMethod = "GET" | "POST" | "PUT";
type SeedProductDefinition = (typeof SEED_PRODUCT_DRAFTS)[number];

export type SeedProductDraftPreflight = {
  ready: boolean;
  fingerprint: string;
  recoveryListingId: number | null;
  shop: { shopId: number; shopName: string };
  products: Array<{
    key: string;
    title: string;
    scientificName: string;
    duplicateListingIds: number[];
  }>;
  taxonomy: { id: number; name: string; path: string } | null;
  shippingProfile: { id: number; title: string; profileType: string; originCountry: string } | null;
  processingProfile: { id: number; label: string; state: string; minimumDays: number; maximumDays: number } | null;
  physicalPackage: {
    weight: number;
    weightUnit: string;
    length: number;
    width: number;
    height: number;
    dimensionsUnit: string;
  } | null;
  blockers: string[];
  warnings: string[];
};

export type SeedProductDraftReadback = {
  key: string;
  listingId: number;
  state: string;
  title: string;
  taxonomy: { id: number; name: string; path: string } | null;
  tags: string[];
  materials: string[];
  variations: Array<{
    productId: number;
    offeringId: number;
    name: string;
    price: number;
    currencyCode: string;
    sku: string;
    quantity: number;
    isEnabled: boolean;
  }>;
  imageCount: number;
  shippingProfile: { id: number; title: string; profileType: string } | null;
  processingProfile: { id: number; label: string; state: string } | null;
  warnings: string[];
  reviewUrl: string;
};

export class SeedProductDraftError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly listingId: number | null = null
  ) {
    super(message);
  }
}

function positiveInteger(value: unknown) {
  const result = Number(value);
  return Number.isSafeInteger(result) && result > 0 ? result : 0;
}

function positiveNumber(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) && result > 0 ? result : 0;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function flattenTaxonomy(
  nodes: TaxonomyNode[],
  parents: string[] = []
): Array<{ id: number; name: string; path: string }> {
  const output: Array<{ id: number; name: string; path: string }> = [];
  for (const node of nodes) {
    const id = positiveInteger(node.id);
    const name = typeof node.name === "string" ? node.name.trim() : "";
    if (!id || !name) continue;
    const path = [...parents, name];
    output.push({ id, name, path: path.join(" > ") });
    output.push(...flattenTaxonomy(node.children || [], path));
  }
  return output;
}

function moneyValue(value: unknown) {
  const money = (value || {}) as { amount?: unknown; divisor?: unknown; currency_code?: unknown };
  const divisor = Number(money.divisor) > 0 ? Number(money.divisor) : 100;
  return {
    amount: Number(money.amount || 0) / divisor,
    currencyCode: typeof money.currency_code === "string" ? money.currency_code : "USD"
  };
}

function decodeEtsyText(value: string) {
  return value
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function inventoryVariations(inventory: EtsyListingInventory) {
  return (inventory.products || []).filter((product) => !product.is_deleted).flatMap((product) => {
    const name = (product.property_values || []).flatMap((property) => property.values || []).join(" / ");
    return (product.offerings || []).filter((offering) => !offering.is_deleted).map((offering) => {
      const price = moneyValue(offering.price);
      return {
        productId: positiveInteger(product.product_id),
        offeringId: positiveInteger(offering.offering_id),
        name,
        price: price.amount,
        currencyCode: price.currencyCode,
        sku: product.sku?.trim() || "",
        quantity: Number(offering.quantity) || 0,
        isEnabled: Boolean(offering.is_enabled)
      };
    });
  });
}

export function buildSeedProductDraftInventoryPayload(
  product: SeedProductDefinition,
  readinessStateId: number
) {
  return {
    products: product.variants.map((variation, index) => ({
      sku: variation.sku,
      property_values: [{
        property_id: CUSTOM_PACK_SIZE_PROPERTY_ID,
        property_name: "Pack Size",
        value_ids: [index + 1],
        values: [variation.name]
      }],
      offerings: [{
        price: variation.price,
        quantity: index === 0 ? 1 : 0,
        is_enabled: index === 0,
        readiness_state_id: readinessStateId
      }]
    })),
    price_on_property: [CUSTOM_PACK_SIZE_PROPERTY_ID],
    quantity_on_property: [CUSTOM_PACK_SIZE_PROPERTY_ID],
    sku_on_property: [CUSTOM_PACK_SIZE_PROPERTY_ID],
    readiness_state_on_property: []
  };
}

export function seedProductDraftMatchesExistingTitle(product: SeedProductDefinition, title: string) {
  const normalized = title.trim().toLowerCase();
  return normalized === product.title.toLowerCase() ||
    normalized.includes(product.scientificName.toLowerCase()) ||
    normalized.startsWith(`${product.commonName.toLowerCase()} seeds`);
}

function verifyInventory(product: SeedProductDefinition, inventory: EtsyListingInventory) {
  const variations = inventoryVariations(inventory);
  if (variations.length !== product.variants.length) return false;
  for (const property of [inventory.price_on_property, inventory.quantity_on_property, inventory.sku_on_property]) {
    if (!(property || []).map(Number).includes(CUSTOM_PACK_SIZE_PROPERTY_ID)) return false;
  }
  return product.variants.every((expected, index) => variations.some((actual) =>
    actual.sku === expected.sku &&
    actual.name === expected.name &&
    Math.abs(actual.price - expected.price) < 0.001 &&
    actual.quantity === (index === 0 ? 1 : 0) &&
    actual.isEnabled === (index === 0)
  ));
}

type EtsySession = {
  connection: Awaited<ReturnType<typeof getAuthorizedEtsyAccess>>["connection"];
  addTarget(listingId: number): void;
  requestJson<T>(method: EtsyMethod, path: string, bodyFactory?: () => BodyInit | undefined): Promise<T>;
};

async function openSession(
  supabase: SupabaseServiceClient,
  fetchImplementation: typeof fetch = fetch
): Promise<EtsySession> {
  let authorization = await getAuthorizedEtsyAccess(supabase, fetchImplementation);
  const targets = new Set<number>([REFERENCE_SEED_LISTING_ID]);
  let nextRequestAt = 0;

  function assertAllowed(method: EtsyMethod, path: string) {
    const pathname = new URL(path, "https://openapi.etsy.com").pathname;
    const listingMatch = pathname.match(/^\/listings\/([1-9]\d*)(?:\/(inventory|images))?$/);
    const listingId = listingMatch ? Number(listingMatch[1]) : 0;
    const listingAllowed = listingId > 0 && targets.has(listingId);
    const allowed = method === "GET"
      ? pathname === "/users/me" ||
        pathname === `/shops/${SHOP_ID}` ||
        pathname === `/shops/${SHOP_ID}/listings` ||
        pathname === `/shops/${SHOP_ID}/shipping-profiles` ||
        pathname === `/shops/${SHOP_ID}/readiness-state-definitions` ||
        pathname === "/seller-taxonomy/nodes" ||
        listingAllowed
      : method === "POST"
        ? pathname === `/shops/${SHOP_ID}/listings`
        : listingAllowed && listingId !== REFERENCE_SEED_LISTING_ID && pathname.endsWith("/inventory");
    if (!allowed) throw new SeedProductDraftError(`The seed draft workflow rejected ${method} ${pathname}.`, 403);
  }

  async function requestJson<T>(method: EtsyMethod, path: string, bodyFactory?: () => BodyInit | undefined) {
    assertAllowed(method, path);
    async function send() {
      const pause = Math.max(0, nextRequestAt - Date.now());
      if (pause) await wait(pause);
      nextRequestAt = Date.now() + 300;
      const body = bodyFactory?.();
      const headers: Record<string, string> = {
        accept: "application/json",
        authorization: `Bearer ${authorization.accessToken}`,
        "cache-control": "no-cache",
        pragma: "no-cache",
        "x-api-key": etsyApiKeyHeader(authorization.config)
      };
      if (body instanceof URLSearchParams) headers["content-type"] = "application/x-www-form-urlencoded";
      if (typeof body === "string") headers["content-type"] = "application/json";
      return fetchImplementation(`${ETSY_API_BASE_URL}${path}`, { method, headers, body, cache: "no-store" });
    }

    let response = await send();
    if (response.status === 401) {
      authorization = await forceRefreshAuthorizedEtsyAccess(supabase, fetchImplementation);
      response = await send();
    }
    console.info("Etsy seed draft API response", { endpoint: path, status: response.status });
    if (!response.ok) {
      const safeMessage = await readEtsyErrorMessage(response, [
        authorization.accessToken,
        authorization.config.apiKey,
        authorization.config.sharedSecret,
        etsyApiKeyHeader(authorization.config)
      ]);
      console.error("Etsy seed draft API request failed", {
        endpoint: path,
        status: response.status,
        message: safeMessage
      });
      throw new SeedProductDraftError(`Etsy rejected ${method} ${path}: ${safeMessage}`, response.status);
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  return {
    connection: authorization.connection,
    addTarget(listingId: number) {
      targets.add(listingId);
    },
    requestJson
  };
}

async function collectListings(session: EtsySession) {
  const listings: ListingRecord[] = [];
  for (const state of LISTING_STATES) {
    for (let offset = 0; ; offset += 100) {
      const page = await session.requestJson<Page<ListingRecord>>(
        "GET",
        `/shops/${SHOP_ID}/listings?state=${state}&limit=100&offset=${offset}`
      );
      const results = page.results || [];
      listings.push(...results);
      if (results.length < 100 || offset + results.length >= Number(page.count || 0)) break;
    }
  }
  return listings;
}

async function preflightWithSession(session: EtsySession): Promise<SeedProductDraftPreflight> {
  const blockers: string[] = [];
  const scopes = session.connection.granted_scopes || [];
  const missing = REQUIRED_SCOPES.filter((scope) => !scopes.includes(scope));
  if (missing.length) blockers.push(`The Etsy connection is missing: ${missing.join(", ")}.`);

  for (const product of SEED_PRODUCT_DRAFTS) {
    if (product.title.length > 140) blockers.push(`${product.commonName} title exceeds Etsy's 140-character limit.`);
    if (product.tags.length !== 13 || product.tags.some((tag) => tag.length > 20)) {
      blockers.push(`${product.commonName} tags do not satisfy Etsy's current limits.`);
    }
  }

  const self = await session.requestJson<EtsySelf>("GET", "/users/me");
  if (positiveInteger(self.shop_id) !== SHOP_ID || positiveInteger(session.connection.shop_id) !== SHOP_ID) {
    blockers.push("The authenticated Etsy account does not match the saved BaseCampNorthPA connection.");
  }
  const shop = await session.requestJson<EtsyShop>("GET", `/shops/${SHOP_ID}`);
  if (positiveInteger(shop.shop_id) !== SHOP_ID || shop.shop_name !== ETSY_EXPECTED_SHOP_NAME) {
    blockers.push("The authenticated Etsy shop is not BaseCampNorthPA.");
  }

  const reference = await session.requestJson<ListingRecord>("GET", `/listings/${REFERENCE_SEED_LISTING_ID}`);
  const taxonomyId = positiveInteger(reference.taxonomy_id);
  const shippingProfileId = positiveInteger(reference.shipping_profile_id);
  const readinessStateId = positiveInteger(reference.readiness_state_id);
  const returnPolicyId = positiveInteger(reference.return_policy_id);
  const shopSectionId = positiveInteger(reference.shop_section_id);
  const itemWeight = positiveNumber(reference.item_weight);
  const itemLength = positiveNumber(reference.item_length);
  const itemWidth = positiveNumber(reference.item_width);
  const itemHeight = positiveNumber(reference.item_height);
  const itemWeightUnit = reference.item_weight_unit || "";
  const itemDimensionsUnit = reference.item_dimensions_unit || "";
  if (positiveInteger(reference.shop_id) !== SHOP_ID || reference.state !== "active") {
    blockers.push("The confirmed Spicebush seed reference listing is not active in BaseCampNorthPA.");
  }
  if (!taxonomyId || !shippingProfileId || !readinessStateId || !itemWeight || !itemLength || !itemWidth || !itemHeight) {
    blockers.push("The reference seed listing does not expose complete category, fulfillment, and package settings.");
  }

  const taxonomyTree = await session.requestJson<Page<TaxonomyNode>>("GET", "/seller-taxonomy/nodes");
  const taxonomy = flattenTaxonomy(taxonomyTree.results || []).find((node) => node.id === taxonomyId) || null;
  if (!taxonomy || !/Seeds/i.test(taxonomy.path)) blockers.push("The current Etsy taxonomy did not verify a seed category.");

  const shippingProfiles = await session.requestJson<Page<ShippingProfile>>("GET", `/shops/${SHOP_ID}/shipping-profiles`);
  const shipping = (shippingProfiles.results || []).find((profile) =>
    positiveInteger(profile.shipping_profile_id) === shippingProfileId && !profile.is_deleted
  ) || null;
  if (!shipping) blockers.push("The reference seed shipping profile is not currently available.");

  const processingProfiles = await session.requestJson<Page<ProcessingProfile>>(
    "GET",
    `/shops/${SHOP_ID}/readiness-state-definitions?limit=100&offset=0`
  );
  const processing = (processingProfiles.results || []).find((profile) =>
    positiveInteger(profile.readiness_state_id) === readinessStateId
  ) || null;
  if (!processing) blockers.push("The reference seed processing profile is not currently available.");

  const listings = await collectListings(session);
  const snailseed = SEED_PRODUCT_DRAFTS.find((product) => product.key === "carolina-snailseed")!;
  const recoveryCandidate = listings.find((listing) =>
    positiveInteger(listing.listing_id) === RECOVERABLE_SNAILSEED_DRAFT_ID
  );
  let recoveryListingId: number | null = null;
  if (recoveryCandidate) {
    session.addTarget(RECOVERABLE_SNAILSEED_DRAFT_ID);
    const recoveryListing = await session.requestJson<ListingRecord>(
      "GET",
      `/listings/${RECOVERABLE_SNAILSEED_DRAFT_ID}`
    );
    const recoveryImages = await session.requestJson<Page<ListingImage>>(
      "GET",
      `/listings/${RECOVERABLE_SNAILSEED_DRAFT_ID}/images`
    );
    const exactRecoveryMatch = positiveInteger(recoveryListing.shop_id) === SHOP_ID &&
      recoveryListing.state === "draft" &&
      recoveryListing.title === snailseed.title &&
      decodeEtsyText(recoveryListing.description || "") === snailseed.description &&
      JSON.stringify(recoveryListing.tags || []) === JSON.stringify(snailseed.tags) &&
      JSON.stringify(recoveryListing.materials || []) === JSON.stringify(snailseed.materials) &&
      (recoveryImages.results || []).length === 0;
    if (exactRecoveryMatch) {
      recoveryListingId = RECOVERABLE_SNAILSEED_DRAFT_ID;
    } else {
      blockers.push(
        `The partial Snailseed draft ${RECOVERABLE_SNAILSEED_DRAFT_ID} no longer exactly matches this operation; no listing will be changed.`
      );
    }
  }
  const products = SEED_PRODUCT_DRAFTS.map((product) => {
    const duplicateListingIds = listings
      .filter((listing) => seedProductDraftMatchesExistingTitle(product, listing.title || ""))
      .map((listing) => positiveInteger(listing.listing_id))
      .filter(Boolean);
    const isExactRecovery = product.key === "carolina-snailseed" &&
      recoveryListingId === RECOVERABLE_SNAILSEED_DRAFT_ID &&
      duplicateListingIds.length === 1 &&
      duplicateListingIds[0] === RECOVERABLE_SNAILSEED_DRAFT_ID;
    if (duplicateListingIds.length && !isExactRecovery) {
      blockers.push(`${product.commonName} already has a matching Etsy listing (${duplicateListingIds.join(", ")}).`);
    }
    return { key: product.key, title: product.title, scientificName: product.scientificName, duplicateListingIds };
  });

  const fingerprint = createHash("sha256").update(JSON.stringify({
    products: SEED_PRODUCT_DRAFTS,
    taxonomyId,
    shippingProfileId,
    readinessStateId,
    returnPolicyId,
    shopSectionId,
    itemWeight,
    itemWeightUnit,
    itemLength,
    itemWidth,
    itemHeight,
    itemDimensionsUnit,
    recoveryListingId
  })).digest("hex");

  return {
    ready: blockers.length === 0,
    fingerprint,
    recoveryListingId,
    shop: { shopId: SHOP_ID, shopName: shop.shop_name || "" },
    products,
    taxonomy,
    shippingProfile: shipping ? {
      id: shippingProfileId,
      title: shipping.title?.trim() || "Untitled shipping profile",
      profileType: shipping.profile_type || "unknown",
      originCountry: shipping.origin_country_iso || "unknown"
    } : null,
    processingProfile: processing ? {
      id: readinessStateId,
      label: processing.processing_days_display_label || "Processing time not labeled",
      state: processing.readiness_state || "unknown",
      minimumDays: Number(processing.min_processing_days) || 0,
      maximumDays: Number(processing.max_processing_days) || 0
    } : null,
    physicalPackage: itemWeight && itemLength && itemWidth && itemHeight ? {
      weight: itemWeight,
      weightUnit: itemWeightUnit,
      length: itemLength,
      width: itemWidth,
      height: itemHeight,
      dimensionsUnit: itemDimensionsUnit
    } : null,
    blockers,
    warnings: [
      "The two listings will remain drafts and receive no images.",
      ...(recoveryListingId ? [
        `The exact partial Snailseed draft ${recoveryListingId}, created by the interrupted attempt, will be recovered instead of creating a duplicate.`
      ] : []),
      "Etsy requires every physical draft to retain at least one enabled offering with quantity greater than zero. Each listing will keep the minimum draft-only inventory: 25 Seeds quantity 1 enabled and 100 Seeds quantity 0 disabled. The listing remains a draft and is unavailable to buyers.",
      "No Etsy listing state or publication endpoint is available to this operation."
    ]
  };
}

export async function preflightSeedProductDrafts(supabase: SupabaseServiceClient) {
  return preflightWithSession(await openSession(supabase));
}

async function readDraft(
  session: EtsySession,
  product: SeedProductDefinition,
  listingId: number,
  preflight: SeedProductDraftPreflight
): Promise<SeedProductDraftReadback> {
  const listing = await session.requestJson<ListingRecord>("GET", `/listings/${listingId}`);
  const inventory = await session.requestJson<EtsyListingInventory>("GET", `/listings/${listingId}/inventory`);
  const images = await session.requestJson<Page<ListingImage>>("GET", `/listings/${listingId}/images`);
  const warnings: string[] = [];
  if (positiveInteger(listing.shop_id) !== SHOP_ID) warnings.push("Shop read-back mismatch.");
  if (listing.state !== "draft") warnings.push("Listing is not a draft.");
  if (listing.title !== product.title) warnings.push("Title read-back mismatch.");
  if (decodeEtsyText(listing.description || "") !== product.description) warnings.push("Description read-back mismatch.");
  if (JSON.stringify(listing.tags || []) !== JSON.stringify(product.tags)) warnings.push("Tag read-back mismatch.");
  if (JSON.stringify(listing.materials || []) !== JSON.stringify(product.materials)) warnings.push("Material read-back mismatch.");
  if (!verifyInventory(product, inventory)) warnings.push("Minimum draft inventory read-back mismatch.");
  if ((images.results || []).length !== 0) warnings.push("Unexpected listing images were returned.");

  return {
    key: product.key,
    listingId,
    state: listing.state || "unknown",
    title: listing.title || "",
    taxonomy: preflight.taxonomy,
    tags: listing.tags || [],
    materials: listing.materials || [],
    variations: inventoryVariations(inventory),
    imageCount: (images.results || []).length,
    shippingProfile: preflight.shippingProfile ? {
      id: preflight.shippingProfile.id,
      title: preflight.shippingProfile.title,
      profileType: preflight.shippingProfile.profileType
    } : null,
    processingProfile: preflight.processingProfile ? {
      id: preflight.processingProfile.id,
      label: preflight.processingProfile.label,
      state: preflight.processingProfile.state
    } : null,
    warnings,
    reviewUrl: `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`
  };
}

export async function createSeedProductDrafts(
  supabase: SupabaseServiceClient,
  expectedFingerprint: string
) {
  const session = await openSession(supabase);
  const preflight = await preflightWithSession(session);
  if (!preflight.ready || !preflight.taxonomy || !preflight.shippingProfile || !preflight.processingProfile || !preflight.physicalPackage) {
    throw new SeedProductDraftError(preflight.blockers.join(" ") || "The seed draft preflight is incomplete.", 409);
  }
  if (preflight.fingerprint !== expectedFingerprint) {
    throw new SeedProductDraftError("The Etsy preflight changed; no draft was created.", 409);
  }

  const reference = await session.requestJson<ListingRecord>("GET", `/listings/${REFERENCE_SEED_LISTING_ID}`);
  const results: SeedProductDraftReadback[] = [];

  for (const product of SEED_PRODUCT_DRAFTS) {
    let listingId = product.key === "carolina-snailseed" ? preflight.recoveryListingId || 0 : 0;
    const createBody = new URLSearchParams({
      quantity: "1",
      title: product.title,
      description: product.description,
      price: String(product.variants[0].price),
      who_made: "i_did",
      when_made: "2020_2026",
      taxonomy_id: String(preflight.taxonomy.id),
      shipping_profile_id: String(preflight.shippingProfile.id),
      readiness_state_id: String(preflight.processingProfile.id),
      item_weight: String(preflight.physicalPackage.weight),
      item_weight_unit: preflight.physicalPackage.weightUnit,
      item_length: String(preflight.physicalPackage.length),
      item_width: String(preflight.physicalPackage.width),
      item_height: String(preflight.physicalPackage.height),
      item_dimensions_unit: preflight.physicalPackage.dimensionsUnit,
      materials: product.materials.join(","),
      tags: product.tags.join(","),
      is_supply: "true",
      is_customizable: "false",
      should_auto_renew: "false",
      type: "physical"
    });
    const returnPolicyId = positiveInteger(reference.return_policy_id);
    const shopSectionId = positiveInteger(reference.shop_section_id);
    if (returnPolicyId) createBody.set("return_policy_id", String(returnPolicyId));
    if (shopSectionId) createBody.set("shop_section_id", String(shopSectionId));

    if (!listingId) {
      const created = await session.requestJson<ListingRecord>("POST", `/shops/${SHOP_ID}/listings`, () => createBody);
      listingId = positiveInteger(created.listing_id);
      if (!listingId || created.state !== "draft") {
        throw new SeedProductDraftError(`Etsy did not return a verified ${product.commonName} draft.`, 502, listingId || null);
      }
    }
    session.addTarget(listingId);

    await session.requestJson<EtsyListingInventory>(
      "PUT",
      `/listings/${listingId}/inventory`,
      () => JSON.stringify(buildSeedProductDraftInventoryPayload(product, preflight.processingProfile!.id))
    );
    const readback = await readDraft(session, product, listingId, preflight);
    if (readback.warnings.length) {
      throw new SeedProductDraftError(
        `${product.commonName} draft read-back failed: ${readback.warnings.join(" ")}`,
        502,
        listingId
      );
    }
    results.push(readback);
  }

  return { results };
}
