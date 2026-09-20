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
const REFERENCE_SEED_LISTING_ID = 4504040390;
const CUSTOM_PACK_SIZE_PROPERTY_ID = 513;
const REQUIRED_SCOPES = ["shops_r", "listings_r", "listings_w"] as const;

export const SPICEBUSH_DRAFT_TITLE =
  "Spicebush Seeds (Lindera benzoin) | Native Pollinator Shrub | Spice Bush Seeds for Planting | Wildlife & Woodland Garden";

export const SPICEBUSH_DRAFT_DESCRIPTION = `Grow one of eastern North America's distinctive native woodland shrubs from seed.

Spicebush (Lindera benzoin) is a native deciduous shrub known for fragrant foliage, small yellow flowers in early spring, and bright red fruit on female plants later in the season. It is an excellent choice for woodland gardens, native plantings, wildlife habitat and pollinator gardens.

Spicebush is also an important host plant for the Spicebush Swallowtail butterfly.

Seed Details
- Spicebush (Lindera benzoin)
- Fresh 2026 harvest
- Cleaned and processed by Base Camp North
- Untreated seeds
- Sold for propagation
- Actual seed shown in the listing photos

Pack Sizes
- 25 seeds — $5.99
- 100 seeds — $12.99

Growing Information

Fresh Spicebush seed has dormancy requirements and should not be treated like ordinary vegetable seed. It generally benefits from cold, moist stratification before germination. Do not guarantee a specific germination percentage or germination time.

Spicebush plants are dioecious, meaning male and female flowers normally occur on separate plants. Multiple seedlings are useful when the goal is eventual fruit production because a female plant requires compatible pollen from a male plant.

Seed-grown plants can naturally vary.

Seeds are sold for propagation and are not intended for consumption.`;

export const SPICEBUSH_DRAFT_TAGS = [
  "spicebush seeds",
  "spice bush seeds",
  "lindera benzoin",
  "native shrub",
  "native plant seeds",
  "pollinator garden",
  "butterfly host",
  "woodland garden",
  "wildlife habitat",
  "seeds for planting",
  "native garden",
  "shade garden",
  "wildlife garden"
] as const;

export const SPICEBUSH_DRAFT_MATERIALS = ["spicebush seeds", "untreated seeds"] as const;

export const SPICEBUSH_DRAFT_VARIATIONS = [
  { name: "Pack of 25 seeds", price: 5.99, sku: "BCN-SPICE-25-2026", quantity: 1, isEnabled: true },
  { name: "Pack of 100 seeds", price: 12.99, sku: "BCN-SPICE-100-2026", quantity: 0, isEnabled: false }
] as const;

export const SPICEBUSH_DRAFT_CONFIRMATION = "CREATE SPICEBUSH DRAFT";

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
type ListingImage = { listing_image_id?: number; rank?: number; alt_text?: string | null };
type EtsyMethod = "GET" | "POST" | "PUT";

export type SpicebushPreflight = {
  ready: boolean;
  fingerprint: string;
  shop: { shopId: number; shopName: string };
  title: string;
  titleLength: number;
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

export class SpicebushDraftError extends Error {
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

function verifyInventory(inventory: EtsyListingInventory) {
  const variations = inventoryVariations(inventory);
  if (variations.length !== SPICEBUSH_DRAFT_VARIATIONS.length) return false;
  for (const property of [inventory.price_on_property, inventory.quantity_on_property, inventory.sku_on_property]) {
    if (!(property || []).map(Number).includes(CUSTOM_PACK_SIZE_PROPERTY_ID)) return false;
  }
  return SPICEBUSH_DRAFT_VARIATIONS.every((expected) => variations.some((actual) =>
    actual.sku === expected.sku &&
    actual.name === expected.name &&
    Math.abs(actual.price - expected.price) < 0.001 &&
    actual.quantity === expected.quantity &&
    actual.isEnabled === expected.isEnabled
  ));
}

function inventoryPayload(readinessStateId: number) {
  return {
    products: SPICEBUSH_DRAFT_VARIATIONS.map((variation, index) => ({
      sku: variation.sku,
      property_values: [{
        property_id: CUSTOM_PACK_SIZE_PROPERTY_ID,
        property_name: "Pack Size",
        value_ids: [index + 1],
        values: [variation.name]
      }],
      offerings: [{
        price: variation.price,
        quantity: variation.quantity,
        is_enabled: variation.isEnabled,
        readiness_state_id: readinessStateId
      }]
    })),
    price_on_property: [CUSTOM_PACK_SIZE_PROPERTY_ID],
    quantity_on_property: [CUSTOM_PACK_SIZE_PROPERTY_ID],
    sku_on_property: [CUSTOM_PACK_SIZE_PROPERTY_ID],
    readiness_state_on_property: []
  };
}

type EtsySession = {
  connection: Awaited<ReturnType<typeof getAuthorizedEtsyAccess>>["connection"];
  setTarget(listingId: number): void;
  requestJson<T>(method: EtsyMethod, path: string, bodyFactory?: () => BodyInit | undefined): Promise<T>;
};

async function openSession(
  supabase: SupabaseServiceClient,
  targetListingId = 0,
  fetchImplementation: typeof fetch = fetch
): Promise<EtsySession> {
  let authorization = await getAuthorizedEtsyAccess(supabase, fetchImplementation);
  let target = positiveInteger(targetListingId);
  let nextRequestAt = 0;

  function assertAllowed(method: EtsyMethod, path: string) {
    const pathname = new URL(path, "https://openapi.etsy.com").pathname;
    const readListingMatch = pathname.match(/^\/listings\/([1-9]\d*)(?:\/(inventory|images))?$/);
    const readListingId = readListingMatch ? Number(readListingMatch[1]) : 0;
    const readListingAllowed = readListingId === REFERENCE_SEED_LISTING_ID || (target > 0 && readListingId === target);
    const allowed = method === "GET"
      ? pathname === "/users/me" ||
        pathname === `/shops/${SHOP_ID}` ||
        pathname === `/shops/${SHOP_ID}/listings` ||
        pathname === `/shops/${SHOP_ID}/shipping-profiles` ||
        pathname === `/shops/${SHOP_ID}/readiness-state-definitions` ||
        pathname === "/seller-taxonomy/nodes" ||
        readListingAllowed
      : method === "POST"
        ? pathname === `/shops/${SHOP_ID}/listings` ||
          (target > 0 && pathname === `/shops/${SHOP_ID}/listings/${target}/images`)
        : target > 0 && pathname === `/listings/${target}/inventory`;
    if (!allowed) throw new SpicebushDraftError(`The Spicebush workflow rejected ${method} ${pathname}.`, 403, target || null);
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
    console.info("Etsy Spicebush draft API response", { endpoint: path, status: response.status });
    if (!response.ok) {
      const safeMessage = await readEtsyErrorMessage(response, [
        authorization.accessToken,
        authorization.config.apiKey,
        authorization.config.sharedSecret,
        etsyApiKeyHeader(authorization.config)
      ]);
      console.error("Etsy Spicebush draft API request failed", {
        endpoint: path,
        status: response.status,
        message: safeMessage
      });
      throw new SpicebushDraftError(`Etsy rejected ${method} ${path}: ${safeMessage}`, response.status, target || null);
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  return {
    connection: authorization.connection,
    setTarget(listingId: number) {
      target = positiveInteger(listingId);
    },
    requestJson
  };
}

async function collectDrafts(session: EtsySession) {
  const drafts: ListingRecord[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await session.requestJson<Page<ListingRecord>>(
      "GET",
      `/shops/${SHOP_ID}/listings?state=draft&limit=100&offset=${offset}`
    );
    const results = page.results || [];
    drafts.push(...results);
    if (results.length < 100 || offset + results.length >= Number(page.count || 0)) break;
  }
  return drafts;
}

async function preflightWithSession(session: EtsySession): Promise<SpicebushPreflight> {
  const blockers: string[] = [];
  const scopes = session.connection.granted_scopes || [];
  const missing = REQUIRED_SCOPES.filter((scope) => !scopes.includes(scope));
  if (missing.length) blockers.push(`The Etsy connection is missing: ${missing.join(", ")}.`);
  if (SPICEBUSH_DRAFT_TITLE.length > 140) blockers.push("The approved title exceeds Etsy's current length limit.");
  if (SPICEBUSH_DRAFT_TAGS.length !== 13 || SPICEBUSH_DRAFT_TAGS.some((tag) => tag.length > 20)) {
    blockers.push("The approved tags do not satisfy Etsy's current tag limits.");
  }

  const self = await session.requestJson<EtsySelf>("GET", "/users/me");
  if (positiveInteger(self.shop_id) !== SHOP_ID || positiveInteger(session.connection.shop_id) !== SHOP_ID) {
    blockers.push("The authenticated Etsy account does not match the stored BaseCampNorthPA connection.");
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
    blockers.push("The confirmed Catalpa seed reference listing is not active in BaseCampNorthPA.");
  }
  if (!taxonomyId || !shippingProfileId || !readinessStateId || !itemWeight || !itemLength || !itemWidth || !itemHeight) {
    blockers.push("The reference seed listing does not expose a complete category, fulfillment setup, and package.");
  }

  const taxonomyTree = await session.requestJson<Page<TaxonomyNode>>("GET", "/seller-taxonomy/nodes");
  const taxonomy = flattenTaxonomy(taxonomyTree.results || []).find((node) => node.id === taxonomyId) || null;
  if (!taxonomy || !/Seeds/i.test(taxonomy.path)) blockers.push("The current Etsy taxonomy did not verify the seed category.");

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

  const duplicateIds = (await collectDrafts(session))
    .filter((listing) => listing.title?.trim() === SPICEBUSH_DRAFT_TITLE)
    .map((listing) => positiveInteger(listing.listing_id))
    .filter(Boolean);
  if (duplicateIds.length) blockers.push(`An exact Spicebush draft already exists (${duplicateIds.join(", ")}).`);

  const fingerprint = createHash("sha256").update(JSON.stringify({
    title: SPICEBUSH_DRAFT_TITLE,
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
    itemDimensionsUnit
  })).digest("hex");

  return {
    ready: blockers.length === 0,
    fingerprint,
    shop: { shopId: SHOP_ID, shopName: shop.shop_name || "" },
    title: SPICEBUSH_DRAFT_TITLE,
    titleLength: SPICEBUSH_DRAFT_TITLE.length,
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
      "No BCN physical inventory value was supplied.",
      "Etsy requires a positive quantity on one enabled draft offering, so the safe placeholder is 1 for the enabled 25-seed option and 0 for the disabled 100-seed option."
    ]
  };
}

export async function preflightSpicebushDraft(supabase: SupabaseServiceClient) {
  return preflightWithSession(await openSession(supabase));
}

export async function createSpicebushDraft(supabase: SupabaseServiceClient, expectedFingerprint: string) {
  const session = await openSession(supabase);
  const preflight = await preflightWithSession(session);
  if (!preflight.ready || !preflight.taxonomy || !preflight.shippingProfile || !preflight.processingProfile || !preflight.physicalPackage) {
    throw new SpicebushDraftError(preflight.blockers.join(" ") || "The Spicebush draft preflight is incomplete.", 409);
  }
  if (preflight.fingerprint !== expectedFingerprint) {
    throw new SpicebushDraftError("The Etsy preflight changed; no draft was created.", 409);
  }

  const reference = await session.requestJson<ListingRecord>("GET", `/listings/${REFERENCE_SEED_LISTING_ID}`);
  const createBody = new URLSearchParams({
    quantity: "1",
    title: SPICEBUSH_DRAFT_TITLE,
    description: SPICEBUSH_DRAFT_DESCRIPTION,
    price: "5.99",
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
    materials: SPICEBUSH_DRAFT_MATERIALS.join(","),
    tags: SPICEBUSH_DRAFT_TAGS.join(","),
    is_supply: "true",
    is_customizable: "false",
    should_auto_renew: "false",
    type: "physical"
  });
  const returnPolicyId = positiveInteger(reference.return_policy_id);
  const shopSectionId = positiveInteger(reference.shop_section_id);
  if (returnPolicyId) createBody.set("return_policy_id", String(returnPolicyId));
  if (shopSectionId) createBody.set("shop_section_id", String(shopSectionId));

  const created = await session.requestJson<ListingRecord>("POST", `/shops/${SHOP_ID}/listings`, () => createBody);
  const listingId = positiveInteger(created.listing_id);
  if (!listingId || created.state !== "draft") {
    throw new SpicebushDraftError("Etsy did not return a verified draft listing.", 502, listingId || null);
  }
  session.setTarget(listingId);
  const listing = await session.requestJson<ListingRecord>("GET", `/listings/${listingId}`);
  if (positiveInteger(listing.shop_id) !== SHOP_ID || listing.state !== "draft" || listing.title !== SPICEBUSH_DRAFT_TITLE) {
    throw new SpicebushDraftError("The newly created Etsy listing failed the draft identity check.", 502, listingId);
  }

  await session.requestJson<EtsyListingInventory>(
    "PUT",
    `/listings/${listingId}/inventory`,
    () => JSON.stringify(inventoryPayload(preflight.processingProfile!.id))
  );
  const inventory = await session.requestJson<EtsyListingInventory>("GET", `/listings/${listingId}/inventory`);
  if (!verifyInventory(inventory)) {
    throw new SpicebushDraftError("The draft inventory read-back did not match the approved placeholder configuration.", 502, listingId);
  }
  return { listingId, state: "draft" as const };
}

function validateDraft(listing: ListingRecord, inventory: EtsyListingInventory, listingId: number) {
  if (
    positiveInteger(listing.listing_id) !== listingId ||
    positiveInteger(listing.shop_id) !== SHOP_ID ||
    listing.state !== "draft" ||
    listing.title !== SPICEBUSH_DRAFT_TITLE ||
    !verifyInventory(inventory)
  ) {
    throw new SpicebushDraftError("The target is not the verified new Spicebush draft.", 409, listingId);
  }
}

export async function uploadSpicebushImage(
  supabase: SupabaseServiceClient,
  input: { listingId: number; rank: number; image: Blob; fileName: string; altText: string }
) {
  if (!positiveInteger(input.listingId) || ![1, 2, 3, 4].includes(input.rank)) {
    throw new SpicebushDraftError("A valid Spicebush draft and image rank are required.");
  }
  if (input.image.type !== "image/jpeg" || input.image.size <= 0 || input.image.size > 4_400_000) {
    throw new SpicebushDraftError("Each upload must be a JPEG no larger than 4.4 MB.");
  }
  const session = await openSession(supabase, input.listingId);
  const listing = await session.requestJson<ListingRecord>("GET", `/listings/${input.listingId}`);
  const inventory = await session.requestJson<EtsyListingInventory>("GET", `/listings/${input.listingId}/inventory`);
  validateDraft(listing, inventory, input.listingId);
  const images = await session.requestJson<Page<ListingImage>>("GET", `/listings/${input.listingId}/images`);
  const existing = (images.results || []).find((image) => Number(image.rank) === input.rank);
  if (existing) return { uploaded: false, rank: input.rank, imageId: positiveInteger(existing.listing_image_id) };

  const uploaded = await session.requestJson<ListingImage>(
    "POST",
    `/shops/${SHOP_ID}/listings/${input.listingId}/images`,
    () => {
      const form = new FormData();
      form.append("image", input.image, input.fileName);
      form.append("rank", String(input.rank));
      form.append("overwrite", "false");
      form.append("is_watermarked", "false");
      form.append("alt_text", input.altText);
      return form;
    }
  );
  return { uploaded: true, rank: input.rank, imageId: positiveInteger(uploaded.listing_image_id) };
}

export async function readSpicebushDraft(supabase: SupabaseServiceClient, listingId: number) {
  if (!positiveInteger(listingId)) throw new SpicebushDraftError("A valid listing ID is required.");
  const session = await openSession(supabase, listingId);
  const listing = await session.requestJson<ListingRecord>("GET", `/listings/${listingId}`);
  const inventory = await session.requestJson<EtsyListingInventory>("GET", `/listings/${listingId}/inventory`);
  validateDraft(listing, inventory, listingId);
  const images = await session.requestJson<Page<ListingImage>>("GET", `/listings/${listingId}/images`);
  const taxonomyTree = await session.requestJson<Page<TaxonomyNode>>("GET", "/seller-taxonomy/nodes");
  const shippingProfiles = await session.requestJson<Page<ShippingProfile>>("GET", `/shops/${SHOP_ID}/shipping-profiles`);
  const processingProfiles = await session.requestJson<Page<ProcessingProfile>>(
    "GET",
    `/shops/${SHOP_ID}/readiness-state-definitions?limit=100&offset=0`
  );
  const taxonomyId = positiveInteger(listing.taxonomy_id);
  const shippingProfileId = positiveInteger(listing.shipping_profile_id);
  const readinessStateId = positiveInteger(listing.readiness_state_id);
  const taxonomy = flattenTaxonomy(taxonomyTree.results || []).find((node) => node.id === taxonomyId) || null;
  const shipping = (shippingProfiles.results || []).find((profile) =>
    positiveInteger(profile.shipping_profile_id) === shippingProfileId
  ) || null;
  const processing = (processingProfiles.results || []).find((profile) =>
    positiveInteger(profile.readiness_state_id) === readinessStateId
  ) || null;
  const orderedImages = [...(images.results || [])].sort((left, right) => Number(left.rank) - Number(right.rank));
  const warnings: string[] = [];
  if (listing.description !== SPICEBUSH_DRAFT_DESCRIPTION) warnings.push("Description read-back mismatch.");
  if (JSON.stringify(listing.tags || []) !== JSON.stringify(SPICEBUSH_DRAFT_TAGS)) warnings.push("Tag read-back mismatch.");
  if (orderedImages.length !== 4) warnings.push(`Expected 4 images; Etsy returned ${orderedImages.length}.`);
  warnings.push("Final BCN physical inventory quantities still require owner input before publication.");
  warnings.push("The enabled 25-seed offering uses Etsy's minimum placeholder quantity 1; the disabled 100-seed offering uses 0.");

  return {
    listingId,
    state: listing.state || "unknown",
    title: listing.title || "",
    description: listing.description || "",
    taxonomy,
    tags: listing.tags || [],
    materials: listing.materials || [],
    variations: inventoryVariations(inventory),
    imageCount: orderedImages.length,
    images: orderedImages.map((image) => ({
      imageId: positiveInteger(image.listing_image_id),
      rank: Number(image.rank) || 0,
      altText: image.alt_text?.trim() || ""
    })),
    shippingProfile: shipping ? {
      id: shippingProfileId,
      title: shipping.title?.trim() || "Untitled shipping profile",
      profileType: shipping.profile_type || "unknown"
    } : null,
    processingProfile: processing ? {
      id: readinessStateId,
      label: processing.processing_days_display_label || "Processing time not labeled",
      state: processing.readiness_state || "unknown"
    } : null,
    physicalPackage: {
      weight: positiveNumber(listing.item_weight),
      weightUnit: listing.item_weight_unit || "",
      length: positiveNumber(listing.item_length),
      width: positiveNumber(listing.item_width),
      height: positiveNumber(listing.item_height),
      dimensionsUnit: listing.item_dimensions_unit || ""
    },
    warnings,
    reviewUrl: `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`
  };
}
