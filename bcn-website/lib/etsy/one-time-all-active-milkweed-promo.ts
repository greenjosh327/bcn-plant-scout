import { createHash } from "node:crypto";
import type { SupabaseServiceClient } from "@/lib/admin-api";
import { ETSY_API_BASE_URL, ETSY_EXPECTED_SHOP_NAME, etsyApiKeyHeader } from "./config";
import {
  forceRefreshAuthorizedEtsyAccess,
  getAuthorizedEtsyAccess,
  readEtsyErrorMessage
} from "./client";

const SHOP_ID = 62898597;
const EXPECTED_ACTIVE_IDS = [
  4413010763, 4442425938, 4446971197, 4548521199, 4548529343, 4548542446,
  4548568587, 4566721917, 4567074764, 4567724734, 4574781779, 4579251897,
  4579299098, 4587402614, 4587406138, 4587462457, 4587905409
].sort((a, b) => a - b);
const IMAGE_ALT_TEXT = "Free Common Milkweed Seeds with every Base Camp North order";
const EXPECTED_IMAGE_SHA256 = "efbb7a56869b1272d1fde0627aa246e7651f414a3d355968651ec0ddfc1d35e3";
const EXPECTED_IMAGE_SIZE = 2_871_950;
const REQUEST_DELAY_MS = 225;

const PROMOTION = `🎁 FREE MILKWEED SEEDS WITH EVERY ORDER!

Every Base Camp North order includes a FREE packet of 25 Common Milkweed Seeds (Asclepias syriaca). Help support monarch butterflies, pollinators, and native wildlife habitat—one planting at a time.

No code needed. Your free seeds will automatically be included with your order.`;

type EtsyMethod = "GET" | "POST" | "PATCH";
type Listing = Record<string, unknown> & {
  listing_id?: number;
  shop_id?: number;
  title?: string;
  description?: string;
  state?: string;
};
type ListingImage = {
  listing_image_id?: number;
  rank?: number;
  alt_text?: string | null;
  url_170x135?: string | null;
};
type Page<T> = { count?: number; results?: T[] };
type ListingSnapshot = { listing: Listing; images: ListingImage[]; inventory: unknown; description: string };

export type BulkPromoResult = {
  listingId: number;
  title: string;
  descriptionAppended: boolean;
  imageAdded: boolean;
  imagePosition: number;
  verified: boolean;
};

export class BulkPromoError extends Error {
  constructor(
    message: string,
    public readonly completed: BulkPromoResult[] = [],
    public readonly listingId: number | null = null
  ) {
    super(message);
  }
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function decodeEtsyText(value: string) {
  return value
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function countOccurrences(value: string, search: string) {
  return value.split(search).length - 1;
}

function orderedImages(page: Page<ListingImage>) {
  return [...(page.results || [])].sort((left, right) => Number(left.rank) - Number(right.rank));
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

function protectedListingFields(listing: Listing) {
  const fields = [
    "listing_id", "shop_id", "title", "state", "quantity", "shop_section_id", "featured_rank",
    "non_taxable", "is_taxable", "is_customizable", "is_personalizable", "listing_type", "tags",
    "materials", "shipping_profile_id", "return_policy_id", "processing_min", "processing_max", "who_made",
    "when_made", "is_supply", "item_weight", "item_weight_unit", "item_length", "item_width", "item_height",
    "item_dimensions_unit", "should_auto_renew", "is_private", "taxonomy_id", "readiness_state_id", "sku"
  ];
  return Object.fromEntries(fields.map((field) => [field, listing[field]]));
}

function sameImagePrefix(before: ListingImage[], after: ListingImage[]) {
  return before.every((image, index) =>
    Number(after[index]?.listing_image_id) === Number(image.listing_image_id) &&
    Number(after[index]?.rank) === Number(image.rank)
  );
}

async function openSession(supabase: SupabaseServiceClient) {
  let authorization = await getAuthorizedEtsyAccess(supabase);
  let nextRequestAt = 0;
  if (Number(authorization.connection.shop_id) !== SHOP_ID) {
    throw new BulkPromoError("The stored Etsy connection is not BaseCampNorthPA.");
  }
  if (!(authorization.connection.granted_scopes || []).includes("listings_w")) {
    throw new BulkPromoError("The Etsy connection is missing listings_w.");
  }

  async function request<T>(method: EtsyMethod, path: string, bodyFactory?: () => BodyInit | undefined) {
    const pathname = new URL(path, "https://openapi.etsy.com").pathname;
    const listingRead = pathname.match(/^\/listings\/([1-9]\d*)(?:\/(images|inventory))?$/);
    const listingWrite = pathname.match(/^\/shops\/62898597\/listings\/([1-9]\d*)(?:\/images)?$/);
    const listingId = Number(listingRead?.[1] || listingWrite?.[1] || 0);
    const knownListing = !listingId || EXPECTED_ACTIVE_IDS.includes(listingId);
    const allowed = knownListing && (method === "GET"
      ? pathname === "/users/me" || pathname === `/shops/${SHOP_ID}` ||
        pathname === `/shops/${SHOP_ID}/listings` || Boolean(listingRead)
      : method === "PATCH"
        ? Boolean(listingWrite) && !pathname.endsWith("/images")
        : Boolean(listingWrite) && pathname.endsWith("/images"));
    if (!allowed) throw new BulkPromoError(`Rejected unexpected Etsy endpoint: ${method} ${pathname}`);

    async function send() {
      const pause = Math.max(0, nextRequestAt - Date.now());
      if (pause) await wait(pause);
      nextRequestAt = Date.now() + REQUEST_DELAY_MS;
      const body = bodyFactory?.();
      const headers: Record<string, string> = {
        accept: "application/json",
        authorization: `Bearer ${authorization.accessToken}`,
        "cache-control": "no-cache",
        pragma: "no-cache",
        "x-api-key": etsyApiKeyHeader(authorization.config)
      };
      if (body instanceof URLSearchParams) headers["content-type"] = "application/x-www-form-urlencoded";
      return fetch(`${ETSY_API_BASE_URL}${path}`, { method, headers, body, cache: "no-store" });
    }

    let response = await send();
    if (response.status === 401) {
      authorization = await forceRefreshAuthorizedEtsyAccess(supabase);
      response = await send();
    }
    if (response.status === 429) {
      await wait(Math.min(Math.max(Number(response.headers.get("retry-after")) * 1000 || 1000, 250), 5000));
      response = await send();
    }
    console.info("Etsy one-time bulk promo API response", { endpoint: path, status: response.status });
    if (!response.ok) {
      const safeMessage = await readEtsyErrorMessage(response, [
        authorization.accessToken,
        authorization.config.apiKey,
        authorization.config.sharedSecret,
        etsyApiKeyHeader(authorization.config)
      ]);
      throw new BulkPromoError(`Etsy rejected ${method} ${path} (${response.status}): ${safeMessage}`);
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  return { request };
}

async function verifyIdentity(request: Awaited<ReturnType<typeof openSession>>["request"]) {
  const self = await request<{ shop_id?: number }>("GET", "/users/me");
  const shop = await request<{ shop_id?: number; shop_name?: string }>("GET", `/shops/${SHOP_ID}`);
  if (Number(self.shop_id) !== SHOP_ID || Number(shop.shop_id) !== SHOP_ID || shop.shop_name !== ETSY_EXPECTED_SHOP_NAME) {
    throw new BulkPromoError("The authenticated Etsy identity is not BaseCampNorthPA.");
  }
}

async function activeListings(request: Awaited<ReturnType<typeof openSession>>["request"]) {
  const page = await request<Page<Listing>>("GET", `/shops/${SHOP_ID}/listings?state=active&limit=100&offset=0`);
  return [...(page.results || [])].sort((left, right) => Number(left.listing_id) - Number(right.listing_id));
}

async function readSnapshot(
  request: Awaited<ReturnType<typeof openSession>>["request"],
  listingId: number
): Promise<ListingSnapshot> {
  const listing = await request<Listing>("GET", `/listings/${listingId}`);
  const images = orderedImages(await request<Page<ListingImage>>("GET", `/listings/${listingId}/images`));
  const inventory = await request<unknown>("GET", `/listings/${listingId}/inventory`);
  return { listing, images, inventory, description: decodeEtsyText(String(listing.description || "")) };
}

function summarizeSnapshot(snapshot: ListingSnapshot) {
  const promoCount = countOccurrences(snapshot.description, PROMOTION);
  const promoImages = snapshot.images.filter((image) => image.alt_text === IMAGE_ALT_TEXT);
  const descriptionState = promoCount === 0
    ? "missing"
    : promoCount === 1 && snapshot.description.endsWith(`\n\n${PROMOTION}`) ? "complete" : "conflict";
  const imageState = promoImages.length === 0
    ? "missing"
    : promoImages.length === 1 && Number(promoImages[0].rank) === snapshot.images.length ? "complete" : "conflict";
  const blockers: string[] = [];
  if (descriptionState === "conflict") blockers.push("Promotion text exists but is not the exact single suffix.");
  if (imageState === "conflict") blockers.push("A promotional image exists but is duplicated or not last.");
  if (imageState === "missing" && snapshot.images.length >= 20) blockers.push("The listing already has Etsy's maximum 20 images.");
  return {
    listingId: Number(snapshot.listing.listing_id),
    title: String(snapshot.listing.title || ""),
    state: String(snapshot.listing.state || ""),
    imageCount: snapshot.images.length,
    imageIdsInOrder: snapshot.images.map((image) => Number(image.listing_image_id)),
    descriptionState,
    imageState,
    blockers
  };
}

export async function auditAllActiveMilkweedPromo(supabase: SupabaseServiceClient) {
  const { request } = await openSession(supabase);
  await verifyIdentity(request);
  const listings = await activeListings(request);
  const actualIds = listings.map((listing) => Number(listing.listing_id)).sort((a, b) => a - b);
  const blockers: string[] = [];
  if (stable(actualIds) !== stable(EXPECTED_ACTIVE_IDS)) {
    blockers.push(`The active listing set changed. Expected ${EXPECTED_ACTIVE_IDS.length}; Etsy returned ${actualIds.length}.`);
  }
  const results = [];
  for (const listing of listings) {
    const listingId = Number(listing.listing_id);
    if (!EXPECTED_ACTIVE_IDS.includes(listingId)) continue;
    const summary = summarizeSnapshot(await readSnapshot(request, listingId));
    results.push(summary);
    blockers.push(...summary.blockers.map((message) => `${listingId}: ${message}`));
  }
  return {
    shopId: SHOP_ID,
    activeListingCount: listings.length,
    exactExpectedSet: stable(actualIds) === stable(EXPECTED_ACTIVE_IDS),
    ready: blockers.length === 0,
    blockers,
    listings: results
  };
}

export async function applyAllActiveMilkweedPromo(
  supabase: SupabaseServiceClient,
  input: { image: Blob; fileName: string }
) {
  if (input.image.type !== "image/png" || input.image.size !== EXPECTED_IMAGE_SIZE) {
    throw new BulkPromoError("The uploaded image does not match the approved PNG.");
  }
  const imageBytes = Buffer.from(await input.image.arrayBuffer());
  if (createHash("sha256").update(imageBytes).digest("hex") !== EXPECTED_IMAGE_SHA256) {
    throw new BulkPromoError("The uploaded image hash does not match the approved giveaway graphic.");
  }

  const preflight = await auditAllActiveMilkweedPromo(supabase);
  if (!preflight.ready || !preflight.exactExpectedSet) {
    throw new BulkPromoError(preflight.blockers.join(" ") || "The bulk Etsy preflight failed.");
  }

  const { request } = await openSession(supabase);
  await verifyIdentity(request);
  const completed: BulkPromoResult[] = [];
  for (const item of preflight.listings) {
    const listingId = item.listingId;
    try {
      const before = await readSnapshot(request, listingId);
      const beforeSummary = summarizeSnapshot(before);
      if (beforeSummary.blockers.length) throw new Error(beforeSummary.blockers.join(" "));
      const expectedDescription = beforeSummary.descriptionState === "complete"
        ? before.description
        : `${before.description}\n\n${PROMOTION}`;

      if (beforeSummary.descriptionState === "missing") {
        await request<Listing>("PATCH", `/shops/${SHOP_ID}/listings/${listingId}`, () =>
          new URLSearchParams({ description: expectedDescription })
        );
        const readback = await request<Listing>("GET", `/listings/${listingId}`);
        if (decodeEtsyText(String(readback.description || "")) !== expectedDescription) {
          throw new Error("Description read-back mismatch.");
        }
      }

      let uploadedImageId = 0;
      if (beforeSummary.imageState === "missing") {
        const uploaded = await request<ListingImage>("POST", `/shops/${SHOP_ID}/listings/${listingId}/images`, () => {
          const form = new FormData();
          form.append("image", new Blob([imageBytes], { type: "image/png" }), input.fileName);
          form.append("rank", String(before.images.length + 1));
          form.append("overwrite", "false");
          form.append("is_watermarked", "false");
          form.append("alt_text", IMAGE_ALT_TEXT);
          return form;
        });
        uploadedImageId = Number(uploaded.listing_image_id) || 0;
      }

      const after = await readSnapshot(request, listingId);
      const finalImage = after.images[after.images.length - 1];
      const expectedImageCount = before.images.length + (beforeSummary.imageState === "missing" ? 1 : 0);
      const finalChecks = {
        identity: Number(after.listing.listing_id) === listingId && Number(after.listing.shop_id) === SHOP_ID,
        state: after.listing.state === "active",
        description: after.description === expectedDescription && countOccurrences(after.description, PROMOTION) === 1,
        imageCount: after.images.length === expectedImageCount,
        oldImagesPreserved: sameImagePrefix(before.images, after.images),
        promoImageLast:
          finalImage?.alt_text === IMAGE_ALT_TEXT ||
          (uploadedImageId > 0 && Number(finalImage?.listing_image_id) === uploadedImageId),
        otherFields: stable(protectedListingFields(before.listing)) === stable(protectedListingFields(after.listing)),
        inventory: stable(before.inventory) === stable(after.inventory)
      };
      if (Object.values(finalChecks).some((value) => !value)) {
        throw new Error(`Final read-back failed: ${JSON.stringify(finalChecks)}`);
      }
      completed.push({
        listingId,
        title: String(after.listing.title || ""),
        descriptionAppended: beforeSummary.descriptionState === "missing",
        imageAdded: beforeSummary.imageState === "missing",
        imagePosition: after.images.length,
        verified: true
      });
    } catch (error) {
      throw new BulkPromoError(
        error instanceof Error ? error.message : "Unknown listing update error.",
        completed,
        listingId
      );
    }
  }

  return {
    shopId: SHOP_ID,
    activeListingCount: preflight.activeListingCount,
    completedCount: completed.length,
    changedCount: completed.filter((item) => item.descriptionAppended || item.imageAdded).length,
    allVerified: completed.length === preflight.activeListingCount && completed.every((item) => item.verified),
    listings: completed
  };
}
