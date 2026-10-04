import { createHash } from "node:crypto";
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
const PRODUCT_IMAGE_BUCKET = "product-images";
const PRODUCT_ID = "prod_bottlebrush-buckeye-seeds";
const PRODUCT_SLUG = "bottlebrush-buckeye-seeds";
const REQUIRED_SCOPES = ["shops_r", "listings_r", "listings_w"] as const;
const LISTING_STATES = ["active", "inactive", "sold_out", "draft", "removed", "expired"] as const;
const PROMO_STORAGE_PATH = "promotions/milkweed-giveaway-efbb7a56869b1272d.png";
const PROMO_SHA256 = "efbb7a56869b1272d1fde0627aa246e7651f414a3d355968651ec0ddfc1d35e3";
const PROMO_SIZE = 2_871_950;

export const BOTTLEBRUSH_TITLE =
  "Bottlebrush Buckeye Seeds (Aesculus parviflora) | Native Flowering Shrub | Shade & Pollinator Garden";
export const BOTTLEBRUSH_SKU = "BCN-BBB-3-DRAFT-2026";
export const BOTTLEBRUSH_PRICE = 8;
export const BOTTLEBRUSH_TAGS = [
  "bottlebrush buckeye",
  "aesculus parviflora",
  "buckeye seeds",
  "native shrub seeds",
  "shade garden",
  "pollinator shrub",
  "woodland garden",
  "seeds for planting",
  "native plant seeds",
  "hummingbird garden",
  "flowering shrub",
  "moist shade plant",
  "southern native"
] as const;
export const BOTTLEBRUSH_MATERIALS = [
  "Bottlebrush Buckeye Seeds",
  "Aesculus parviflora",
  "Fresh 2026 Seeds",
  "Untreated Seeds",
  "Native Shrub Seeds"
] as const;

const MILKWEED_PROMOTION = `🎁 FREE MILKWEED SEEDS WITH EVERY ORDER!

Every Base Camp North order includes a FREE packet of 25 Common Milkweed Seeds (Asclepias syriaca). Help support monarch butterflies, pollinators, and native wildlife habitat—one planting at a time.

No code needed. Your free seeds will automatically be included with your order.`;

const CORE_DESCRIPTION = `Grow Bottlebrush Buckeye (Aesculus parviflora), a southeastern U.S. native deciduous shrub known for showy upright spikes of white summer flowers. It is an excellent choice for woodland edges, shade gardens, pollinator plantings, and moist naturalized areas.

Bottlebrush Buckeye typically forms a broad, multi-stemmed colony over time. Its flowers attract butterflies, hummingbirds, and other pollinators, while its palmately compound foliage develops yellow fall color.

THIS LISTING IS FOR:
- One individually labeled packet containing 3 fresh Bottlebrush Buckeye seeds

Seed Details:
- Bottlebrush Buckeye (Aesculus parviflora)
- Fresh 2026 harvest
- Untreated seeds
- Sold for propagation
- Seasonal, limited-availability item
- Seed-grown plants may naturally vary

Growing Information:
Bottlebrush Buckeye seed should be planted promptly after harvest and must not be allowed to dry out. Sow in a deep container or protected outdoor seed bed with rich, moist, well-drained growing medium. Keep the medium evenly moist but not waterlogged, and protect the seeds from squirrels and other rodents.

Fresh seed may begin root development before visible shoot growth. Germination percentage and timing are not guaranteed.

Safety Warning:
All parts of Bottlebrush Buckeye, including the seeds, are poisonous if ingested. Seeds are sold only for propagation and are not intended for food or animal feed. Keep away from children, pets, and livestock.`;

export const BCN_BOTTLEBRUSH_DESCRIPTION = `${CORE_DESCRIPTION}\n\n${MILKWEED_PROMOTION}`;
export const ETSY_BOTTLEBRUSH_DESCRIPTION = `${BCN_BOTTLEBRUSH_DESCRIPTION}\n\nDRAFT NOTE FOR SHOP OWNER: Confirm the Pack of 3 and available quantity before publishing.`;

const INPUT_IMAGES = [
  {
    key: "main",
    fileName: "20261004_142339.jpg",
    contentType: "image/jpeg",
    size: 3_748_404,
    sha256: "b45c9f1733c0ea3c7b8db312075d5806b5408a0d2ba1a7216ca9744c8e33bf6d",
    storagePath: `products/${PRODUCT_ID}/bottlebrush-buckeye-seeds.jpg`,
    altText: "Three fresh Bottlebrush Buckeye seeds held in a hand"
  },
  {
    key: "parent",
    fileName: "image-1790454023903.jpg",
    contentType: "image/jpeg",
    size: 185_483,
    sha256: "0275a3fbdc4cf01286c000cae81582377d1b03a668b9ca431c21b76dca65117e",
    storagePath: `products/${PRODUCT_ID}/bottlebrush-buckeye-fruit-and-leaves.jpg`,
    altText: "Bottlebrush Buckeye fruit hanging among palmately compound leaves"
  },
  {
    key: "opened",
    fileName: "image-1790454172189.jpg",
    contentType: "image/jpeg",
    size: 86_994,
    sha256: "ffc80eb4293613b8e3e225f8496a3e49356a34d4f565e30b2e44055e4f556683",
    storagePath: `products/${PRODUCT_ID}/bottlebrush-buckeye-open-capsule.jpg`,
    altText: "Fresh Bottlebrush Buckeye seed inside an opened leathery capsule"
  }
] as const;

const PROMO_IMAGE = {
  key: "promo",
  fileName: "Base Camp North Milkweed Seed Giveaway.png",
  contentType: "image/png",
  size: PROMO_SIZE,
  sha256: PROMO_SHA256,
  storagePath: PROMO_STORAGE_PATH,
  altText: "Free Common Milkweed Seeds with every Base Camp North order"
} as const;

type InputKey = (typeof INPUT_IMAGES)[number]["key"];
type ListingRecord = Record<string, unknown> & {
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
type ListingImage = { listing_image_id?: number; rank?: number; alt_text?: string | null };
type Page<T> = { count?: number; results?: T[] };
type EtsyMethod = "GET" | "POST" | "PUT";
type ProductRow = Record<string, unknown> & { id: string; slug: string; active: boolean };
type DbImage = Record<string, unknown> & { id: string; product_id: string; storage_path: string | null; sort_order: number };

export type BottlebrushPreflight = {
  ready: boolean;
  fingerprint: string;
  blockers: string[];
  warnings: string[];
  etsyDraftId: number | null;
  bcnProductState: "missing" | "exact-recovery";
  reference: {
    taxonomyId: number;
    shippingProfileId: number;
    readinessStateId: number;
    returnPolicyId: number;
    shopSectionId: number;
    itemWeight: number;
    itemWeightUnit: string;
    itemLength: number;
    itemWidth: number;
    itemHeight: number;
    itemDimensionsUnit: string;
  };
};

export class BottlebrushOperationError extends Error {
  constructor(message: string, public readonly status = 400, public readonly listingId: number | null = null) {
    super(message);
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function decodeEtsyText(value: string) {
  return value
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function productValues() {
  return {
    id: PRODUCT_ID,
    slug: PRODUCT_SLUG,
    name: "Bottlebrush Buckeye Seeds (Aesculus parviflora)",
    scientific_name: "Aesculus parviflora",
    common_name: "Bottlebrush Buckeye",
    category: "Seeds",
    description: BCN_BOTTLEBRUSH_DESCRIPTION,
    price: BOTTLEBRUSH_PRICE,
    inventory: 0,
    sold_out: true,
    product_type: "standard",
    featured: false,
    active: true,
    plant_type: "Native flowering shrub seed",
    native_status: "Southeastern United States",
    hardiness_zones: "Zones 5–9",
    sunlight: "Shade to Part Shade",
    soil: "Rich, moist, well-drained",
    height: "8–12 ft",
    spread: "8–15 ft",
    bloom_time: "Early to Mid-Summer",
    wildlife_benefits: "Supports hummingbirds, butterflies, and other pollinators",
    pollinator_benefits: "High",
    host_species: null,
    growing_notes: "Bottlebrush Buckeye prefers rich, moist, well-drained soil in shade to part shade. It develops into a broad, suckering colony and should be given room to spread.",
    planting_instructions: "Plant fresh seed promptly in a deep container or protected outdoor bed. Keep it evenly moist but not waterlogged, do not allow it to dry, and protect it from rodents. Fresh seed may begin root development before shoot growth.",
    shipping_notes: "Fresh seed is seasonal and moisture-sensitive. Plant promptly after arrival and do not allow it to dry out.",
    show_hardiness_zones: true,
    show_sunlight: true,
    show_soil: true,
    show_bloom_time: true,
    show_height: true,
    show_spread: true,
    show_native_status: true,
    show_wildlife_benefits: true,
    show_pollinator_benefits: true,
    show_host_species: false,
    shipping_class: "seed_package",
    shipping_enabled: true,
    local_pickup_enabled: true,
    local_pickup: true,
    ships: true,
    packed_weight_oz: 4,
    packed_length_in: null,
    packed_width_in: null,
    packed_height_in: null,
    ships_alone: false,
    expedited_required: false,
    allow_ground_advantage: true,
    free_shipping_eligible: false,
    shipping_surcharge_cents: 0,
    max_quantity_per_package: 2,
    preferred_package_id: "preset_small_padded_mailer",
    shipping_configuration_complete: true,
    tags: [...BOTTLEBRUSH_TAGS],
    source: "manual"
  };
}

function comparableProduct(row: ProductRow) {
  const expected = productValues();
  return Object.fromEntries(Object.keys(expected).map((key) => [key, row[key]]));
}

export function bottlebrushInventoryPayload(readinessStateId: number) {
  return {
    products: [{
      sku: BOTTLEBRUSH_SKU,
      property_values: [],
      offerings: [{ price: BOTTLEBRUSH_PRICE, quantity: 1, is_enabled: true, readiness_state_id: readinessStateId }]
    }],
    price_on_property: [],
    quantity_on_property: [],
    sku_on_property: [],
    readiness_state_on_property: []
  };
}

function inventoryMatches(inventory: EtsyListingInventory) {
  const products = (inventory.products || []).filter((product) => !product.is_deleted);
  if (products.length !== 1 || products[0].sku !== BOTTLEBRUSH_SKU || (products[0].property_values || []).length !== 0) return false;
  const offerings = (products[0].offerings || []).filter((offering) => !offering.is_deleted);
  const offering = offerings[0];
  const amount = Number(offering?.price?.amount || 0) / (Number(offering?.price?.divisor) || 100);
  return offerings.length === 1 && Math.abs(amount - BOTTLEBRUSH_PRICE) < 0.001 &&
    Number(offering.quantity) === 1 && Boolean(offering.is_enabled);
}

async function openEtsySession(supabase: SupabaseServiceClient) {
  let authorization = await getAuthorizedEtsyAccess(supabase);
  const allowedListingIds = new Set<number>([REFERENCE_SEED_LISTING_ID]);
  let nextRequestAt = 0;

  function allowListing(listingId: number) {
    allowedListingIds.add(listingId);
  }

  async function requestJson<T>(method: EtsyMethod, path: string, bodyFactory?: () => BodyInit | undefined) {
    const pathname = new URL(path, "https://openapi.etsy.com").pathname;
    const listingMatch = pathname.match(/^\/listings\/([1-9]\d*)(?:\/(inventory|images))?$/);
    const imageWriteMatch = pathname.match(/^\/shops\/62898597\/listings\/([1-9]\d*)\/images$/);
    const listingId = Number(listingMatch?.[1] || imageWriteMatch?.[1] || 0);
    const listingAllowed = listingId > 0 && allowedListingIds.has(listingId);
    const allowed = method === "GET"
      ? pathname === "/users/me" || pathname === `/shops/${SHOP_ID}` ||
        pathname === `/shops/${SHOP_ID}/listings` || listingAllowed
      : method === "POST"
        ? pathname === `/shops/${SHOP_ID}/listings` || (Boolean(imageWriteMatch) && listingAllowed && listingId !== REFERENCE_SEED_LISTING_ID)
        : listingAllowed && listingId !== REFERENCE_SEED_LISTING_ID && pathname.endsWith("/inventory");
    if (!allowed) throw new BottlebrushOperationError(`Rejected unexpected Etsy endpoint: ${method} ${pathname}`, 403);

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
      return fetch(`${ETSY_API_BASE_URL}${path}`, { method, headers, body, cache: "no-store" });
    }

    let response = await send();
    if (response.status === 401) {
      authorization = await forceRefreshAuthorizedEtsyAccess(supabase);
      response = await send();
    }
    console.info("Etsy Bottlebrush Buckeye draft API response", { endpoint: path, status: response.status });
    if (!response.ok) {
      const message = await readEtsyErrorMessage(response, [
        authorization.accessToken,
        authorization.config.apiKey,
        authorization.config.sharedSecret,
        etsyApiKeyHeader(authorization.config)
      ]);
      throw new BottlebrushOperationError(`Etsy rejected ${method} ${path}: ${message}`, response.status, listingId || null);
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  return { connection: authorization.connection, allowListing, requestJson };
}

async function collectListings(session: Awaited<ReturnType<typeof openEtsySession>>) {
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

async function readBcnState(supabase: SupabaseServiceClient) {
  const { data: products, error } = await supabase
    .from("products")
    .select("*")
    .or(`id.eq.${PRODUCT_ID},slug.eq.${PRODUCT_SLUG}`);
  if (error) throw new BottlebrushOperationError(`Could not read BCN products: ${error.message}`, 500);
  const rows = (products || []) as ProductRow[];
  const product = rows.find((row) => row.id === PRODUCT_ID && row.slug === PRODUCT_SLUG) || null;
  const wrongRows = rows.filter((row) => row !== product);
  const { data: images, error: imageError } = await supabase
    .from("product_images")
    .select("*")
    .eq("product_id", PRODUCT_ID);
  if (imageError) throw new BottlebrushOperationError(`Could not read BCN product images: ${imageError.message}`, 500);
  const { data: variants, error: variantError } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", PRODUCT_ID);
  if (variantError) throw new BottlebrushOperationError(`Could not read BCN variants: ${variantError.message}`, 500);
  return { product, wrongRows, images: (images || []) as DbImage[], variantCount: variants?.length || 0 };
}

function expectedDbImages(publicUrls: Record<string, string>) {
  const definitions = [...INPUT_IMAGES, PROMO_IMAGE];
  return definitions.map((image, index) => ({
    id: `img_bottlebrush_buckeye_${image.key}`,
    product_id: PRODUCT_ID,
    storage_path: image.storagePath,
    public_url: publicUrls[image.key],
    alt_text: image.altText,
    sort_order: index,
    is_primary: index === 0
  }));
}

function etsyListingIsExactDraft(listing: ListingRecord) {
  return Number(listing.shop_id) === SHOP_ID && listing.state === "draft" &&
    listing.title === BOTTLEBRUSH_TITLE && decodeEtsyText(String(listing.description || "")) === ETSY_BOTTLEBRUSH_DESCRIPTION &&
    stable(listing.tags || []) === stable([...BOTTLEBRUSH_TAGS]) && stable(listing.materials || []) === stable([...BOTTLEBRUSH_MATERIALS]);
}

async function preflightWithSession(
  supabase: SupabaseServiceClient,
  session: Awaited<ReturnType<typeof openEtsySession>>
): Promise<BottlebrushPreflight> {
  const blockers: string[] = [];
  const missingScopes = REQUIRED_SCOPES.filter((scope) => !(session.connection.granted_scopes || []).includes(scope));
  if (missingScopes.length) blockers.push(`The Etsy connection is missing: ${missingScopes.join(", ")}.`);
  if (BOTTLEBRUSH_TITLE.length > 140) blockers.push("The Etsy title exceeds 140 characters.");
  if (BOTTLEBRUSH_TAGS.length !== 13 || BOTTLEBRUSH_TAGS.some((tag) => tag.length > 20)) {
    blockers.push("The Etsy tags do not satisfy the current limits.");
  }

  const self = await session.requestJson<EtsySelf>("GET", "/users/me");
  const shop = await session.requestJson<EtsyShop>("GET", `/shops/${SHOP_ID}`);
  if (Number(self.shop_id) !== SHOP_ID || Number(session.connection.shop_id) !== SHOP_ID ||
      Number(shop.shop_id) !== SHOP_ID || shop.shop_name !== ETSY_EXPECTED_SHOP_NAME) {
    blockers.push("The authenticated Etsy identity is not BaseCampNorthPA.");
  }

  const reference = await session.requestJson<ListingRecord>("GET", `/listings/${REFERENCE_SEED_LISTING_ID}`);
  const referenceValues = {
    taxonomyId: positiveInteger(reference.taxonomy_id),
    shippingProfileId: positiveInteger(reference.shipping_profile_id),
    readinessStateId: positiveInteger(reference.readiness_state_id),
    returnPolicyId: positiveInteger(reference.return_policy_id),
    shopSectionId: positiveInteger(reference.shop_section_id),
    itemWeight: positiveNumber(reference.item_weight),
    itemWeightUnit: String(reference.item_weight_unit || ""),
    itemLength: positiveNumber(reference.item_length),
    itemWidth: positiveNumber(reference.item_width),
    itemHeight: positiveNumber(reference.item_height),
    itemDimensionsUnit: String(reference.item_dimensions_unit || "")
  };
  if (Number(reference.shop_id) !== SHOP_ID || reference.state !== "active" ||
      !referenceValues.taxonomyId || !referenceValues.shippingProfileId || !referenceValues.readinessStateId ||
      !referenceValues.itemWeight || !referenceValues.itemLength || !referenceValues.itemWidth || !referenceValues.itemHeight) {
    blockers.push("The confirmed active seed reference listing no longer has complete draft settings.");
  }

  const listings = await collectListings(session);
  const matches = listings.filter((listing) => {
    const title = String(listing.title || "").toLowerCase();
    return title.includes("aesculus parviflora") || title.startsWith("bottlebrush buckeye seeds");
  });
  let etsyDraftId: number | null = null;
  if (matches.length === 1) {
    const listingId = positiveInteger(matches[0].listing_id);
    session.allowListing(listingId);
    const candidate = await session.requestJson<ListingRecord>("GET", `/listings/${listingId}`);
    if (etsyListingIsExactDraft(candidate)) {
      etsyDraftId = listingId;
      const images = await session.requestJson<Page<ListingImage>>("GET", `/listings/${listingId}/images`);
      const allowedAlt = new Set<string>([...INPUT_IMAGES, PROMO_IMAGE].map((image) => image.altText));
      if ((images.results || []).some((image) => !allowedAlt.has(String(image.alt_text || "")))) {
        blockers.push(`The recoverable Etsy draft ${listingId} contains an unexpected image.`);
      }
    } else {
      blockers.push(`A Bottlebrush Buckeye Etsy listing already exists (${listingId}) but does not exactly match this operation.`);
    }
  } else if (matches.length > 1) {
    blockers.push(`Multiple Bottlebrush Buckeye Etsy listings already exist (${matches.map((listing) => listing.listing_id).join(", ")}).`);
  }

  const bcn = await readBcnState(supabase);
  if (bcn.wrongRows.length) blockers.push("A conflicting BCN product ID or slug already exists.");
  let bcnProductState: "missing" | "exact-recovery" = "missing";
  if (bcn.product) {
    if (stable(comparableProduct(bcn.product)) !== stable(productValues()) || bcn.variantCount !== 0) {
      blockers.push("The existing BCN Bottlebrush Buckeye product does not exactly match this operation.");
    } else {
      bcnProductState = "exact-recovery";
      const expectedPaths = new Set<string>([...INPUT_IMAGES, PROMO_IMAGE].map((image) => image.storagePath));
      if (bcn.images.some((image) => !expectedPaths.has(String(image.storage_path || "")))) {
        blockers.push("The existing BCN product contains an unexpected image.");
      }
    }
  }

  const fingerprint = createHash("sha256").update(stable({
    title: BOTTLEBRUSH_TITLE,
    etsyDescription: ETSY_BOTTLEBRUSH_DESCRIPTION,
    bcnProduct: productValues(),
    tags: BOTTLEBRUSH_TAGS,
    materials: BOTTLEBRUSH_MATERIALS,
    images: [...INPUT_IMAGES, PROMO_IMAGE],
    referenceValues,
    etsyDraftId,
    bcnProductState
  })).digest("hex");
  return {
    ready: blockers.length === 0,
    fingerprint,
    blockers,
    warnings: [
      "The Etsy listing will remain a draft and will not be published.",
      "The Etsy draft uses Pack of 3, price $8.00, and the minimum draft-only quantity of 1.",
      "The BCN product will be active but sold out with inventory 0 until finished-pack inventory is entered."
    ],
    etsyDraftId,
    bcnProductState,
    reference: referenceValues
  };
}

export async function auditBottlebrushBuckeye(supabase: SupabaseServiceClient) {
  return preflightWithSession(supabase, await openEtsySession(supabase));
}

async function ensureStorageImage(
  supabase: SupabaseServiceClient,
  image: { storagePath: string; contentType: string; size: number; sha256: string },
  bytes: Buffer
) {
  if (bytes.length !== image.size || createHash("sha256").update(bytes).digest("hex") !== image.sha256) {
    throw new BottlebrushOperationError("An uploaded Bottlebrush Buckeye image did not match the approved file.", 400);
  }
  const bucket = supabase.storage.from(PRODUCT_IMAGE_BUCKET);
  const upload = await bucket.upload(image.storagePath, bytes, {
    cacheControl: "31536000",
    contentType: image.contentType,
    upsert: false
  });
  if (upload.error) {
    const existing = await bucket.download(image.storagePath);
    if (existing.error || !existing.data) throw new BottlebrushOperationError(`Could not store a BCN product image: ${upload.error.message}`, 500);
    const existingBytes = Buffer.from(await existing.data.arrayBuffer());
    if (existingBytes.length !== image.size || createHash("sha256").update(existingBytes).digest("hex") !== image.sha256) {
      throw new BottlebrushOperationError("An existing BCN product image does not match the approved file.", 409);
    }
  }
  return bucket.getPublicUrl(image.storagePath).data.publicUrl;
}

async function upsertBcnProduct(
  supabase: SupabaseServiceClient,
  publicUrls: Record<string, string>
) {
  const current = await readBcnState(supabase);
  if (!current.product) {
    const { error } = await supabase.from("products").insert(productValues());
    if (error) throw new BottlebrushOperationError(`Could not create the BCN product: ${error.message}`, 500);
  }
  const expectedImages = expectedDbImages(publicUrls);
  const afterProduct = await readBcnState(supabase);
  for (const image of expectedImages) {
    if (afterProduct.images.some((existing) => existing.id === image.id && existing.storage_path === image.storage_path)) continue;
    const { error } = await supabase.from("product_images").insert(image);
    if (error) throw new BottlebrushOperationError(`Could not add a BCN product image: ${error.message}`, 500);
  }
  const verified = await readBcnState(supabase);
  const orderedImages = [...verified.images].sort((left, right) => Number(left.sort_order) - Number(right.sort_order));
  if (!verified.product || stable(comparableProduct(verified.product)) !== stable(productValues()) ||
      verified.variantCount !== 0 || stable(orderedImages.map((image) => image.storage_path)) !== stable(expectedImages.map((image) => image.storage_path))) {
    throw new BottlebrushOperationError("BCN product read-back verification failed.", 502);
  }
  return { product: verified.product, images: orderedImages };
}

async function readEtsyResult(session: Awaited<ReturnType<typeof openEtsySession>>, listingId: number) {
  const listing = await session.requestJson<ListingRecord>("GET", `/listings/${listingId}`);
  const inventory = await session.requestJson<EtsyListingInventory>("GET", `/listings/${listingId}/inventory`);
  const images = await session.requestJson<Page<ListingImage>>("GET", `/listings/${listingId}/images`);
  return { listing, inventory, images: [...(images.results || [])].sort((a, b) => Number(a.rank) - Number(b.rank)) };
}

export async function applyBottlebrushBuckeye(
  supabase: SupabaseServiceClient,
  expectedFingerprint: string,
  files: Record<InputKey, Blob>
) {
  const inputBytes = Object.fromEntries(await Promise.all(INPUT_IMAGES.map(async (image) => {
    const file = files[image.key];
    if (!file || file.type !== image.contentType || file.size !== image.size) {
      throw new BottlebrushOperationError(`The ${image.key} image did not match the approved file.`, 400);
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== image.sha256) {
      throw new BottlebrushOperationError(`The ${image.key} image hash did not match the approved file.`, 400);
    }
    return [image.key, bytes] as const;
  })));

  const session = await openEtsySession(supabase);
  const preflight = await preflightWithSession(supabase, session);
  if (!preflight.ready || preflight.fingerprint !== expectedFingerprint) {
    throw new BottlebrushOperationError(preflight.blockers.join(" ") || "The operation preflight changed; nothing was created.", 409);
  }

  const publicUrls: Record<string, string> = {};
  for (const image of INPUT_IMAGES) {
    publicUrls[image.key] = await ensureStorageImage(supabase, image, inputBytes[image.key]);
  }
  const promoBlob = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).download(PROMO_STORAGE_PATH);
  if (promoBlob.error || !promoBlob.data) throw new BottlebrushOperationError("The approved milkweed promotion image is unavailable.", 500);
  const promoBytes = Buffer.from(await promoBlob.data.arrayBuffer());
  if (promoBytes.length !== PROMO_SIZE || createHash("sha256").update(promoBytes).digest("hex") !== PROMO_SHA256) {
    throw new BottlebrushOperationError("The stored milkweed promotion image failed verification.", 409);
  }
  publicUrls.promo = supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(PROMO_STORAGE_PATH).data.publicUrl;
  const bcn = await upsertBcnProduct(supabase, publicUrls);

  let listingId = preflight.etsyDraftId || 0;
  if (!listingId) {
    const body = new URLSearchParams({
      quantity: "1",
      title: BOTTLEBRUSH_TITLE,
      description: ETSY_BOTTLEBRUSH_DESCRIPTION,
      price: String(BOTTLEBRUSH_PRICE),
      who_made: "i_did",
      when_made: "2020_2026",
      taxonomy_id: String(preflight.reference.taxonomyId),
      shipping_profile_id: String(preflight.reference.shippingProfileId),
      readiness_state_id: String(preflight.reference.readinessStateId),
      item_weight: String(preflight.reference.itemWeight),
      item_weight_unit: preflight.reference.itemWeightUnit,
      item_length: String(preflight.reference.itemLength),
      item_width: String(preflight.reference.itemWidth),
      item_height: String(preflight.reference.itemHeight),
      item_dimensions_unit: preflight.reference.itemDimensionsUnit,
      materials: BOTTLEBRUSH_MATERIALS.join(","),
      tags: BOTTLEBRUSH_TAGS.join(","),
      is_supply: "true",
      is_customizable: "false",
      should_auto_renew: "false",
      type: "physical"
    });
    if (preflight.reference.returnPolicyId) body.set("return_policy_id", String(preflight.reference.returnPolicyId));
    if (preflight.reference.shopSectionId) body.set("shop_section_id", String(preflight.reference.shopSectionId));
    const created = await session.requestJson<ListingRecord>("POST", `/shops/${SHOP_ID}/listings`, () => body);
    listingId = positiveInteger(created.listing_id);
    if (!listingId || created.state !== "draft") {
      throw new BottlebrushOperationError("Etsy did not return a verified draft listing.", 502, listingId || null);
    }
    session.allowListing(listingId);
  }

  await session.requestJson<EtsyListingInventory>(
    "PUT",
    `/listings/${listingId}/inventory`,
    () => JSON.stringify(bottlebrushInventoryPayload(preflight.reference.readinessStateId))
  );

  const existing = await session.requestJson<Page<ListingImage>>("GET", `/listings/${listingId}/images`);
  const expectedImages = [
    { ...INPUT_IMAGES[0], bytes: inputBytes.main },
    { ...INPUT_IMAGES[1], bytes: inputBytes.parent },
    { ...INPUT_IMAGES[2], bytes: inputBytes.opened },
    { ...PROMO_IMAGE, bytes: promoBytes }
  ];
  const existingAlt = new Set((existing.results || []).map((image) => String(image.alt_text || "")));
  if ((existing.results || []).length && (existing.results || []).length !== expectedImages.length) {
    throw new BottlebrushOperationError("The recoverable Etsy draft has a partial image set; no additional images were uploaded.", 409, listingId);
  }
  if ((existing.results || []).length === 0) {
    for (const image of [...expectedImages].reverse()) {
      await session.requestJson<ListingImage>("POST", `/shops/${SHOP_ID}/listings/${listingId}/images`, () => {
        const form = new FormData();
        form.append("image", new Blob([image.bytes], { type: image.contentType }), image.fileName);
        form.append("rank", "1");
        form.append("overwrite", "false");
        form.append("is_watermarked", "false");
        form.append("alt_text", image.altText);
        return form;
      });
    }
  } else if (expectedImages.some((image) => !existingAlt.has(image.altText))) {
    throw new BottlebrushOperationError("The recoverable Etsy draft image set does not exactly match.", 409, listingId);
  }

  let etsy = await readEtsyResult(session, listingId);
  for (let attempt = 0; attempt < 10 && etsy.images.length !== expectedImages.length; attempt += 1) {
    await wait(750);
    etsy = await readEtsyResult(session, listingId);
  }
  const expectedAltOrder = expectedImages.map((image) => image.altText);
  const actualAltOrder = etsy.images.map((image) => String(image.alt_text || ""));
  const verified = etsyListingIsExactDraft(etsy.listing) && inventoryMatches(etsy.inventory) &&
    stable(actualAltOrder) === stable(expectedAltOrder);
  if (!verified) throw new BottlebrushOperationError("Etsy draft read-back verification failed.", 502, listingId);

  return {
    bcn: {
      productId: PRODUCT_ID,
      slug: PRODUCT_SLUG,
      active: bcn.product.active,
      soldOut: bcn.product.sold_out,
      inventory: bcn.product.inventory,
      imageCount: bcn.images.length,
      url: `https://basecampnorthpa.com/shop/product/${PRODUCT_SLUG}`
    },
    etsy: {
      listingId,
      state: etsy.listing.state,
      title: etsy.listing.title,
      sku: BOTTLEBRUSH_SKU,
      quantity: 1,
      price: BOTTLEBRUSH_PRICE,
      imageCount: etsy.images.length,
      verified,
      reviewUrl: `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`
    }
  };
}
