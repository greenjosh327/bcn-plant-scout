import { createHash } from "crypto";
import type { SupabaseServiceClient } from "@/lib/admin-api";
import { ETSY_API_BASE_URL, ETSY_EXPECTED_SHOP_NAME, etsyApiKeyHeader } from "./config";
import {
  forceRefreshAuthorizedEtsyAccess,
  getAuthorizedEtsyAccess,
  readEtsyErrorMessage
} from "./client";
import type { EtsyListingInventory, EtsySelf, EtsyShop } from "./types";

const REFERENCE_SEED_LISTING_ID = 4504040390;
const CUSTOM_PACK_SIZE_PROPERTY_ID = 513;
const REQUIRED_SCOPES = ["shops_r", "listings_r", "listings_w"] as const;

export const MUSCADINE_DRAFT_TITLE =
  "Muscadine Grape Seeds (Vitis rotundifolia) | Southern Native Fruit Vine | Edible Grape Seeds | Wildlife & Food Forest";

export const MUSCADINE_DRAFT_DESCRIPTION = `Grow a classic Southern fruiting vine from seed.

These Muscadine Grape (Vitis rotundifolia) seeds were collected from ripe fruiting vines in Georgia during the 2026 harvest and cleaned and processed by Base Camp North.

Muscadines are vigorous perennial grapevines native to the southeastern United States. Mature vines can produce distinctive thick-skinned grapes traditionally enjoyed fresh and used for juice, jelly, preserves, and wine. The vines can also provide food and habitat value for wildlife.

Seed Details
- Muscadine Grape (Vitis rotundifolia)
- 2026 harvest
- Collected in Georgia
- Cleaned and processed by Base Camp North
- Untreated seed
- Sold for propagation

Pack Sizes
- 25 seeds
- 100 seeds

Growing Information

Muscadine seeds generally benefit from a period of cold, moist stratification before sowing. Germination from seed can take patience, and individual seedlings may differ from the parent vine.

Because these seeds came from an unidentified fruiting vine, no named cultivar is claimed and future fruit characteristics are not guaranteed.

Seeds are sold for propagation and are not intended for consumption.`;

export const MUSCADINE_DRAFT_TAGS = [
  "muscadine seeds",
  "grape seeds",
  "grape vine seeds",
  "vitis rotundifolia",
  "native fruit",
  "southern grape",
  "edible fruit seeds",
  "fruit vine",
  "food forest",
  "backyard vineyard",
  "homestead seeds",
  "wildlife garden",
  "native vine"
] as const;

export const MUSCADINE_DRAFT_MATERIALS = ["muscadine seeds", "untreated seeds"] as const;

export const MUSCADINE_DRAFT_VARIATIONS = [
  { name: "Pack of 25 seeds", price: 5.99, sku: "BCN-MUSC-25-2026", quantity: 0, isEnabled: false },
  { name: "Pack of 100 seeds", price: 12.99, sku: "BCN-MUSC-100-2026", quantity: 0, isEnabled: false }
] as const;

export const MUSCADINE_DRAFT_CONFIRMATION = "CREATE MUSCADINE DRAFT";

type EtsyListingRecord = {
  listing_id?: number;
  shop_id?: number;
  title?: string;
  description?: string;
  state?: string;
  quantity?: number;
  taxonomy_id?: number | null;
  shipping_profile_id?: number | null;
  return_policy_id?: number | null;
  readiness_state_id?: number | null;
  shop_section_id?: number | null;
  is_taxable?: boolean;
  tags?: string[];
  materials?: string[];
};

type EtsyListingPage = { count?: number; results?: EtsyListingRecord[] };

type SellerTaxonomyNode = {
  id?: number;
  name?: string;
  children?: SellerTaxonomyNode[];
  full_path_taxonomy_ids?: number[];
};

type SellerTaxonomyNodes = { results?: SellerTaxonomyNode[] };

type ShippingProfile = {
  shipping_profile_id?: number;
  title?: string | null;
  origin_country_iso?: string;
  is_deleted?: boolean;
  profile_type?: string;
};

type ShippingProfiles = { results?: ShippingProfile[] };

type ProcessingProfile = {
  readiness_state_id?: number;
  readiness_state?: string;
  min_processing_days?: number;
  max_processing_days?: number;
  processing_days_display_label?: string;
};

type ProcessingProfiles = { results?: ProcessingProfile[] };

type ListingImage = {
  listing_image_id?: number;
  rank?: number;
  alt_text?: string | null;
};

type ListingImages = { count?: number; results?: ListingImage[] };

type EtsyRequestMethod = "GET" | "POST" | "PUT";

type RequestBodyFactory = () => BodyInit | undefined;

type EtsySession = {
  connection: Awaited<ReturnType<typeof getAuthorizedEtsyAccess>>["connection"];
  requestJson<T>(method: EtsyRequestMethod, path: string, bodyFactory?: RequestBodyFactory): Promise<T>;
};

export type MuscadineDraftPreflight = {
  ready: boolean;
  fingerprint: string;
  checkedAt: string;
  shop: { shopId: number; shopName: string };
  grantedScopes: string[];
  title: string;
  titleLength: number;
  taxonomy: { id: number; name: string; path: string } | null;
  shippingProfile: { id: number; title: string; profileType: string; originCountry: string } | null;
  processingProfile: {
    id: number;
    state: string;
    minimumDays: number;
    maximumDays: number;
    label: string;
  } | null;
  referenceListing: { listingId: number; title: string; state: string } | null;
  existingDrafts: Array<{ listingId: number; title: string }>;
  quantityPlan: string;
  blockers: string[];
  warnings: string[];
};

export type MuscadineDraftReadback = {
  listingId: number;
  state: string;
  title: string;
  description: string;
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
  images: Array<{ imageId: number; rank: number; altText: string }>;
  shippingProfile: { id: number; title: string; profileType: string } | null;
  processingProfile: { id: number; label: string; state: string } | null;
  quantityInputRequired: boolean;
  reviewUrl: string;
  warnings: string[];
};

export class MuscadineDraftError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly listingId: number | null = null
  ) {
    super(message);
  }
}

function positiveInteger(value: unknown) {
  const numberValue = Number(value);
  return Number.isSafeInteger(numberValue) && numberValue > 0 ? numberValue : 0;
}

function assertMuscadineEtsyRequest(method: EtsyRequestMethod, path: string) {
  const url = new URL(path, "https://openapi.etsy.com");
  const pathname = url.pathname;

  const allowed = method === "GET"
    ? pathname === "/users/me" ||
      /^\/shops\/[1-9]\d*$/.test(pathname) ||
      /^\/shops\/[1-9]\d*\/listings$/.test(pathname) ||
      /^\/listings\/[1-9]\d*$/.test(pathname) ||
      /^\/listings\/[1-9]\d*\/inventory$/.test(pathname) ||
      /^\/listings\/[1-9]\d*\/images$/.test(pathname) ||
      /^\/shops\/[1-9]\d*\/shipping-profiles$/.test(pathname) ||
      /^\/shops\/[1-9]\d*\/readiness-state-definitions$/.test(pathname) ||
      pathname === "/seller-taxonomy/nodes"
    : method === "POST"
      ? /^\/shops\/[1-9]\d*\/listings$/.test(pathname) ||
        /^\/shops\/[1-9]\d*\/listings\/[1-9]\d*\/images$/.test(pathname)
      : /^\/listings\/[1-9]\d*\/inventory$/.test(pathname);

  if (!allowed) throw new Error(`The Etsy draft workflow rejected ${method} ${pathname}.`);
}

async function parseJsonResponse<T>(response: Response) {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Etsy returned a non-JSON response.");
  }
}

async function openEtsySession(
  supabase: SupabaseServiceClient,
  fetchImplementation: typeof fetch = fetch
): Promise<EtsySession> {
  let authorization = await getAuthorizedEtsyAccess(supabase, fetchImplementation);
  let refreshPromise: Promise<void> | null = null;
  let requestQueue = Promise.resolve();
  let nextRequestAt = 0;

  async function waitForRequestSlot() {
    let release!: () => void;
    const previous = requestQueue;
    requestQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const waitMilliseconds = Math.max(0, nextRequestAt - Date.now());
    if (waitMilliseconds > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMilliseconds));
    }
    nextRequestAt = Date.now() + 300;
    release();
  }

  async function refresh() {
    if (!refreshPromise) {
      refreshPromise = forceRefreshAuthorizedEtsyAccess(supabase, fetchImplementation).then((next) => {
        authorization = next;
      }).finally(() => {
        refreshPromise = null;
      });
    }
    await refreshPromise;
  }

  async function requestJson<T>(method: EtsyRequestMethod, path: string, bodyFactory?: RequestBodyFactory) {
    assertMuscadineEtsyRequest(method, path);

    async function send() {
      await waitForRequestSlot();
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

      return fetchImplementation(`${ETSY_API_BASE_URL}${path}`, {
        method,
        headers,
        body,
        cache: "no-store"
      });
    }

    let response = await send();
    if (response.status === 401) {
      await refresh();
      response = await send();
    }

    console.info("Etsy Muscadine draft API response", { endpoint: path, status: response.status });
    if (!response.ok) {
      const safeMessage = await readEtsyErrorMessage(response, [
        authorization.accessToken,
        authorization.config.apiKey,
        authorization.config.sharedSecret,
        etsyApiKeyHeader(authorization.config)
      ]);
      console.error("Etsy Muscadine draft API request failed", {
        endpoint: path,
        status: response.status,
        message: safeMessage
      });
      throw new MuscadineDraftError(`Etsy rejected ${method} ${path}: ${safeMessage}`, response.status);
    }

    return parseJsonResponse<T>(response);
  }

  return { connection: authorization.connection, requestJson };
}

function flattenTaxonomy(nodes: SellerTaxonomyNode[], path: string[] = []) {
  const flattened: Array<{ id: number; name: string; path: string }> = [];
  for (const node of nodes) {
    const id = positiveInteger(node.id);
    const name = typeof node.name === "string" ? node.name.trim() : "";
    if (!id || !name) continue;
    const nextPath = [...path, name];
    flattened.push({ id, name, path: nextPath.join(" > ") });
    flattened.push(...flattenTaxonomy(Array.isArray(node.children) ? node.children : [], nextPath));
  }
  return flattened;
}

async function collectDraftListings(session: EtsySession, shopId: number) {
  const results: EtsyListingRecord[] = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const page = await session.requestJson<EtsyListingPage>(
      "GET",
      `/shops/${shopId}/listings?state=draft&limit=${limit}&offset=${offset}`
    );
    const pageResults = Array.isArray(page.results) ? page.results : [];
    results.push(...pageResults);
    if (pageResults.length < limit || offset + pageResults.length >= Number(page.count || 0)) break;
  }
  return results;
}

function buildFingerprint(input: {
  shopId: number;
  taxonomyId: number;
  shippingProfileId: number;
  readinessStateId: number;
  returnPolicyId: number;
  shopSectionId: number;
}) {
  return createHash("sha256").update(JSON.stringify({ title: MUSCADINE_DRAFT_TITLE, ...input })).digest("hex");
}

async function preflightWithSession(session: EtsySession): Promise<MuscadineDraftPreflight> {
  const blockers: string[] = [];
  const warnings = [
    "The exact cultivar is unknown; the draft makes no cultivar, fruit color, flavor, sweetness, or parent-type consistency claim.",
    "Both pack-size offerings will remain disabled at quantity 0 until the owner supplies final physical inventory."
  ];
  const grantedScopes = session.connection.granted_scopes || [];
  const missingScopes = REQUIRED_SCOPES.filter((scope) => !grantedScopes.includes(scope));
  if (missingScopes.length > 0) blockers.push(`The Etsy connection is missing: ${missingScopes.join(", ")}.`);

  const self = await session.requestJson<EtsySelf>("GET", "/users/me");
  const shopId = positiveInteger(self.shop_id);
  if (!shopId || shopId !== positiveInteger(session.connection.shop_id)) {
    blockers.push("The authenticated Etsy shop does not match the stored BCN connection.");
  }

  const [shop, referenceListing, taxonomyTree, shippingProfiles, processingProfiles, drafts] = await Promise.all([
    session.requestJson<EtsyShop>("GET", `/shops/${shopId}`),
    session.requestJson<EtsyListingRecord>("GET", `/listings/${REFERENCE_SEED_LISTING_ID}`),
    session.requestJson<SellerTaxonomyNodes>("GET", "/seller-taxonomy/nodes"),
    session.requestJson<ShippingProfiles>("GET", `/shops/${shopId}/shipping-profiles`),
    session.requestJson<ProcessingProfiles>("GET", `/shops/${shopId}/readiness-state-definitions?limit=100&offset=0`),
    collectDraftListings(session, shopId)
  ]);

  if (shop.shop_name !== ETSY_EXPECTED_SHOP_NAME) blockers.push("The authenticated Etsy shop is not BaseCampNorthPA.");

  const referenceShopId = positiveInteger(referenceListing.shop_id);
  const taxonomyId = positiveInteger(referenceListing.taxonomy_id);
  const shippingProfileId = positiveInteger(referenceListing.shipping_profile_id);
  const readinessStateId = positiveInteger(referenceListing.readiness_state_id);
  const returnPolicyId = positiveInteger(referenceListing.return_policy_id);
  const shopSectionId = positiveInteger(referenceListing.shop_section_id);
  if (referenceShopId !== shopId || referenceListing.state !== "active") {
    blockers.push("The confirmed Catalpa seed listing is not an active listing in BaseCampNorthPA.");
  }

  const taxonomy = flattenTaxonomy(Array.isArray(taxonomyTree.results) ? taxonomyTree.results : [])
    .find((candidate) => candidate.id === taxonomyId) ?? null;
  if (!taxonomy) blockers.push("The Catalpa seed category is not present in Etsy's current seller taxonomy.");

  const shipping = (shippingProfiles.results || []).find(
    (profile) => positiveInteger(profile.shipping_profile_id) === shippingProfileId && !profile.is_deleted
  ) ?? null;
  if (!shipping) blockers.push("The Catalpa seed shipping profile is no longer available.");

  const processing = (processingProfiles.results || []).find(
    (profile) => positiveInteger(profile.readiness_state_id) === readinessStateId
  ) ?? null;
  if (!processing) blockers.push("The Catalpa seed processing profile is no longer available.");

  const existingDrafts = drafts
    .filter((listing) => listing.title?.trim() === MUSCADINE_DRAFT_TITLE)
    .map((listing) => ({ listingId: positiveInteger(listing.listing_id), title: listing.title?.trim() || "" }))
    .filter((listing) => listing.listingId > 0);
  if (existingDrafts.length > 0) {
    blockers.push("A draft with this exact Muscadine title already exists; no second draft will be created.");
  }

  const fingerprint = buildFingerprint({
    shopId,
    taxonomyId,
    shippingProfileId,
    readinessStateId,
    returnPolicyId,
    shopSectionId
  });

  return {
    ready: blockers.length === 0,
    fingerprint,
    checkedAt: new Date().toISOString(),
    shop: { shopId, shopName: shop.shop_name || "" },
    grantedScopes: [...grantedScopes],
    title: MUSCADINE_DRAFT_TITLE,
    titleLength: MUSCADINE_DRAFT_TITLE.length,
    taxonomy,
    shippingProfile: shipping
      ? {
          id: shippingProfileId,
          title: shipping.title?.trim() || "Untitled shipping profile",
          profileType: shipping.profile_type || "unknown",
          originCountry: shipping.origin_country_iso || "unknown"
        }
      : null,
    processingProfile: processing
      ? {
          id: readinessStateId,
          state: processing.readiness_state || "unknown",
          minimumDays: Number(processing.min_processing_days) || 0,
          maximumDays: Number(processing.max_processing_days) || 0,
          label: processing.processing_days_display_label || "Processing time not labeled"
        }
      : null,
    referenceListing: positiveInteger(referenceListing.listing_id)
      ? {
          listingId: positiveInteger(referenceListing.listing_id),
          title: referenceListing.title?.trim() || "",
          state: referenceListing.state || "unknown"
        }
      : null,
    existingDrafts,
    quantityPlan: "Create the required base draft, then set both variations to quantity 0 and disabled. No physical inventory quantity is inferred.",
    blockers,
    warnings
  };
}

export async function preflightMuscadineDraft(
  supabase: SupabaseServiceClient,
  fetchImplementation: typeof fetch = fetch
) {
  return preflightWithSession(await openEtsySession(supabase, fetchImplementation));
}

export function buildMuscadineDraftCreateBody(preflight: MuscadineDraftPreflight) {
  if (!preflight.taxonomy || !preflight.shippingProfile || !preflight.processingProfile) {
    throw new MuscadineDraftError("The verified Etsy taxonomy and fulfillment profiles are required.");
  }

  const body = new URLSearchParams({
    quantity: "1",
    title: MUSCADINE_DRAFT_TITLE,
    description: MUSCADINE_DRAFT_DESCRIPTION,
    price: MUSCADINE_DRAFT_VARIATIONS[0].price.toFixed(2),
    who_made: "i_did",
    when_made: "2020_2026",
    taxonomy_id: String(preflight.taxonomy.id),
    shipping_profile_id: String(preflight.shippingProfile.id),
    readiness_state_id: String(preflight.processingProfile.id),
    materials: MUSCADINE_DRAFT_MATERIALS.join(","),
    tags: MUSCADINE_DRAFT_TAGS.join(","),
    is_supply: "true",
    is_customizable: "false",
    should_auto_renew: "false",
    type: "physical"
  });

  return body;
}

export function buildMuscadineInventoryPayload(readinessStateId: number) {
  if (!positiveInteger(readinessStateId)) throw new MuscadineDraftError("A verified processing profile is required.");
  return {
    products: MUSCADINE_DRAFT_VARIATIONS.map((variation, index) => ({
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

function moneyValue(value: unknown) {
  if (!value || typeof value !== "object") return { amount: 0, currencyCode: "USD" };
  const money = value as { amount?: unknown; divisor?: unknown; currency_code?: unknown };
  const divisor = Number(money.divisor) > 0 ? Number(money.divisor) : 100;
  return {
    amount: Number(money.amount || 0) / divisor,
    currencyCode: typeof money.currency_code === "string" ? money.currency_code : "USD"
  };
}

function inventoryVariations(inventory: EtsyListingInventory) {
  return (inventory.products || []).flatMap((product) => {
    const productId = positiveInteger(product.product_id);
    const name = (product.property_values || []).flatMap((property) => property.values || []).join(" / ");
    return (product.offerings || []).filter((offering) => !offering.is_deleted).map((offering) => {
      const price = moneyValue(offering.price);
      return {
        productId,
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

export function verifyMuscadineInventory(inventory: EtsyListingInventory) {
  const variations = inventoryVariations(inventory);
  const expected = new Map<string, (typeof MUSCADINE_DRAFT_VARIATIONS)[number]>(
    MUSCADINE_DRAFT_VARIATIONS.map((variation) => [variation.sku, variation])
  );
  if (variations.length !== expected.size) return false;
  if (!(inventory.price_on_property || []).map(Number).includes(CUSTOM_PACK_SIZE_PROPERTY_ID)) return false;
  if (!(inventory.quantity_on_property || []).map(Number).includes(CUSTOM_PACK_SIZE_PROPERTY_ID)) return false;
  if (!(inventory.sku_on_property || []).map(Number).includes(CUSTOM_PACK_SIZE_PROPERTY_ID)) return false;

  return variations.every((variation) => {
    const target = expected.get(variation.sku);
    return Boolean(
      target &&
      variation.name === target.name &&
      Math.abs(variation.price - target.price) < 0.001 &&
      variation.quantity === 0 &&
      !variation.isEnabled
    );
  });
}

export async function createMuscadineDraft(
  supabase: SupabaseServiceClient,
  expectedFingerprint: string,
  fetchImplementation: typeof fetch = fetch
) {
  const session = await openEtsySession(supabase, fetchImplementation);
  const preflight = await preflightWithSession(session);
  if (!preflight.ready) throw new MuscadineDraftError(preflight.blockers.join(" "), 409);
  if (expectedFingerprint !== preflight.fingerprint) {
    throw new MuscadineDraftError("The Etsy preflight changed. Run the preflight again before creating the draft.", 409);
  }

  const body = buildMuscadineDraftCreateBody(preflight);
  const created = await session.requestJson<EtsyListingRecord>(
    "POST",
    `/shops/${preflight.shop.shopId}/listings`,
    () => new URLSearchParams(body)
  );
  const listingId = positiveInteger(created.listing_id);
  if (!listingId) throw new MuscadineDraftError("Etsy did not return a listing ID after draft creation.", 502);
  if (created.state !== "draft") {
    throw new MuscadineDraftError("Etsy created the listing in an unexpected state; no further action was taken.", 502, listingId);
  }

  try {
    const payload = buildMuscadineInventoryPayload(preflight.processingProfile!.id);
    await session.requestJson<EtsyListingInventory>(
      "PUT",
      `/listings/${listingId}/inventory`,
      () => JSON.stringify(payload)
    );
    const inventory = await session.requestJson<EtsyListingInventory>("GET", `/listings/${listingId}/inventory`);
    if (!verifyMuscadineInventory(inventory)) {
      throw new MuscadineDraftError(
        "The new draft was created, but the variation read-back did not match the required zero-quantity configuration.",
        502,
        listingId
      );
    }
  } catch (error) {
    if (error instanceof MuscadineDraftError && error.listingId) throw error;
    throw new MuscadineDraftError(
      `The draft was created, but Etsy did not finish the variation setup: ${error instanceof Error ? error.message : "Unknown error"}`,
      error instanceof MuscadineDraftError ? error.status : 502,
      listingId
    );
  }

  return { listingId, state: "draft" as const };
}

function validateDraftForImage(listing: EtsyListingRecord, inventory: EtsyListingInventory, shopId: number) {
  if (
    positiveInteger(listing.shop_id) !== shopId ||
    listing.state !== "draft" ||
    listing.title?.trim() !== MUSCADINE_DRAFT_TITLE ||
    !verifyMuscadineInventory(inventory)
  ) {
    throw new MuscadineDraftError("The target is not the verified new Muscadine draft.", 409);
  }
}

export async function uploadMuscadineDraftImage(
  supabase: SupabaseServiceClient,
  input: { listingId: number; rank: number; image: Blob; fileName: string },
  fetchImplementation: typeof fetch = fetch
) {
  if (!positiveInteger(input.listingId) || ![1, 2, 3].includes(input.rank)) {
    throw new MuscadineDraftError("A valid Muscadine draft listing and image rank are required.");
  }
  if (input.image.type !== "image/jpeg" || input.image.size <= 0 || input.image.size > 4_600_000) {
    throw new MuscadineDraftError("Each supplied image must be a JPEG no larger than 4.6 MB.");
  }

  const session = await openEtsySession(supabase, fetchImplementation);
  const shopId = positiveInteger(session.connection.shop_id);
  const [listing, inventory, images] = await Promise.all([
    session.requestJson<EtsyListingRecord>("GET", `/listings/${input.listingId}`),
    session.requestJson<EtsyListingInventory>("GET", `/listings/${input.listingId}/inventory`),
    session.requestJson<ListingImages>("GET", `/listings/${input.listingId}/images`)
  ]);
  validateDraftForImage(listing, inventory, shopId);

  const existing = (images.results || []).find((image) => Number(image.rank) === input.rank);
  if (existing) {
    return { uploaded: false, imageId: positiveInteger(existing.listing_image_id), rank: input.rank };
  }

  const altTexts: Record<number, string> = {
    1: "Ripe muscadine grapes growing naturally on the vine",
    2: "Wide bowl view of cleaned Muscadine Grape seeds",
    3: "Close-up view of cleaned Muscadine Grape seeds"
  };
  const uploaded = await session.requestJson<ListingImage>(
    "POST",
    `/shops/${shopId}/listings/${input.listingId}/images`,
    () => {
      const body = new FormData();
      body.append("image", input.image, input.fileName);
      body.append("rank", String(input.rank));
      body.append("overwrite", "false");
      body.append("is_watermarked", "false");
      body.append("alt_text", altTexts[input.rank]);
      return body;
    }
  );

  return { uploaded: true, imageId: positiveInteger(uploaded.listing_image_id), rank: input.rank };
}

async function loadReadbackContext(session: EtsySession, listing: EtsyListingRecord) {
  const shopId = positiveInteger(session.connection.shop_id);
  const [taxonomyTree, shippingProfiles, processingProfiles] = await Promise.all([
    session.requestJson<SellerTaxonomyNodes>("GET", "/seller-taxonomy/nodes"),
    session.requestJson<ShippingProfiles>("GET", `/shops/${shopId}/shipping-profiles`),
    session.requestJson<ProcessingProfiles>("GET", `/shops/${shopId}/readiness-state-definitions?limit=100&offset=0`)
  ]);
  const taxonomyId = positiveInteger(listing.taxonomy_id);
  const taxonomy = flattenTaxonomy(taxonomyTree.results || []).find((node) => node.id === taxonomyId) ?? null;
  const shipping = (shippingProfiles.results || []).find(
    (profile) => positiveInteger(profile.shipping_profile_id) === positiveInteger(listing.shipping_profile_id)
  ) ?? null;
  const processing = (processingProfiles.results || []).find(
    (profile) => positiveInteger(profile.readiness_state_id) === positiveInteger(listing.readiness_state_id)
  ) ?? null;
  return { taxonomy, shipping, processing };
}

export async function readMuscadineDraft(
  supabase: SupabaseServiceClient,
  listingId: number,
  fetchImplementation: typeof fetch = fetch
): Promise<MuscadineDraftReadback> {
  if (!positiveInteger(listingId)) throw new MuscadineDraftError("A valid Etsy listing ID is required.");
  const session = await openEtsySession(supabase, fetchImplementation);
  const [listing, inventory, images] = await Promise.all([
    session.requestJson<EtsyListingRecord>("GET", `/listings/${listingId}`),
    session.requestJson<EtsyListingInventory>("GET", `/listings/${listingId}/inventory`),
    session.requestJson<ListingImages>("GET", `/listings/${listingId}/images`)
  ]);
  if (
    positiveInteger(listing.shop_id) !== positiveInteger(session.connection.shop_id) ||
    listing.title?.trim() !== MUSCADINE_DRAFT_TITLE
  ) {
    throw new MuscadineDraftError("The requested listing is not the BCN Muscadine draft.", 404);
  }

  const context = await loadReadbackContext(session, listing);
  const shippingProfileId = positiveInteger(listing.shipping_profile_id);
  const readinessStateId = positiveInteger(listing.readiness_state_id);
  const sortedImages = [...(images.results || [])].sort((left, right) => Number(left.rank) - Number(right.rank));
  const warnings: string[] = [];
  if (listing.state !== "draft") warnings.push(`Unexpected Etsy state: ${listing.state || "unknown"}.`);
  if (!verifyMuscadineInventory(inventory)) warnings.push("The variation configuration does not match the approved draft specification.");
  if (sortedImages.length !== 3) warnings.push(`Expected 3 images; Etsy currently reports ${sortedImages.length}.`);
  warnings.push("Final physical inventory quantities still require owner input before publication.");

  return {
    listingId,
    state: listing.state || "unknown",
    title: listing.title?.trim() || "",
    description: listing.description || "",
    taxonomy: context.taxonomy,
    tags: Array.isArray(listing.tags) ? listing.tags : [],
    materials: Array.isArray(listing.materials) ? listing.materials : [],
    variations: inventoryVariations(inventory),
    imageCount: sortedImages.length,
    images: sortedImages.map((image) => ({
      imageId: positiveInteger(image.listing_image_id),
      rank: Number(image.rank) || 0,
      altText: image.alt_text?.trim() || ""
    })),
    shippingProfile: context.shipping
      ? {
          id: shippingProfileId,
          title: context.shipping.title?.trim() || "Untitled shipping profile",
          profileType: context.shipping.profile_type || "unknown"
        }
      : null,
    processingProfile: context.processing
      ? {
          id: readinessStateId,
          label: context.processing.processing_days_display_label || "Processing time not labeled",
          state: context.processing.readiness_state || "unknown"
        }
      : null,
    quantityInputRequired: true,
    reviewUrl: `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`,
    warnings
  };
}

export { assertMuscadineEtsyRequest, flattenTaxonomy };
