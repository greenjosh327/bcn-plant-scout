import { createHash } from "node:crypto";
import type { SupabaseServiceClient } from "@/lib/admin-api";
import { ETSY_API_BASE_URL, ETSY_EXPECTED_SHOP_NAME, etsyApiKeyHeader } from "./config";
import {
  forceRefreshAuthorizedEtsyAccess,
  getAuthorizedEtsyAccess,
  readEtsyErrorMessage
} from "./client";

const LISTING_ID = 4587905409;
const SHOP_ID = 62898597;
const IMAGE_ALT_TEXT = "Free Common Milkweed Seeds with every Base Camp North order";
const EXPECTED_IMAGE_SHA256 = "efbb7a56869b1272d1fde0627aa246e7651f414a3d355968651ec0ddfc1d35e3";
const EXPECTED_IMAGE_SIZE = 2_871_950;

const EXPECTED_TITLE =
  "Washington Hawthorn Seeds (Crataegus phaenopyrum) | Native Wildlife Tree | Red Berries & Fall Color";

const ORIGINAL_DESCRIPTION = `Grow Washington Hawthorn (Crataegus phaenopyrum), a native small deciduous tree with white spring flowers, glossy foliage, red fall color, and bright red fruit that can persist into winter. The fruit supports songbirds, and thorny branches provide valuable cover.

Planting Uses:
- Wildlife and bird habitat
- Native hedges and screens
- Restoration plantings
- Small flowering tree for spacious landscapes

Mature trees develop long thorns, so site them away from high-traffic areas. Seed-grown trees may take several years to reach flowering and fruiting age.

Growing Information:
Hawthorn seed has deep dormancy and commonly needs a warm, moist period followed by cold, moist stratification; some seed may need repeated seasonal cycles. Germination percentage and timing are not guaranteed.

DRAFT NOTE FOR SHOP OWNER: Add actual seed photos and confirm final seed count, available quantity, and package options before publishing.`;

const PROMOTION = `🎁 FREE MILKWEED SEEDS WITH EVERY ORDER!

Every Base Camp North order includes a FREE packet of 25 Common Milkweed Seeds (Asclepias syriaca). Help support monarch butterflies, pollinators, and native wildlife habitat—one planting at a time.

No code needed. Your free seeds will automatically be included with your order.`;

const FINAL_DESCRIPTION = `${ORIGINAL_DESCRIPTION}\n\n${PROMOTION}`;
const ORIGINAL_IMAGE_IDS = [8619059796, 8619059852, 8666882501, 8666882617, 8666881953];

type EtsyMethod = "GET" | "POST" | "PATCH";
type Listing = Record<string, unknown> & {
  listing_id?: number;
  shop_id?: number;
  title?: string;
  description?: string;
};
type ListingImage = { listing_image_id?: number; rank?: number; alt_text?: string | null };
type Page<T> = { count?: number; results?: T[] };

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

function originalImagesRemainOrdered(images: ListingImage[]) {
  return ORIGINAL_IMAGE_IDS.every(
    (imageId, index) => Number(images[index]?.listing_image_id) === imageId && Number(images[index]?.rank) === index + 1
  );
}

export async function applyOneTimeMilkweedPromo(
  supabase: SupabaseServiceClient,
  input: { image: Blob; fileName: string }
) {
  if (input.image.type !== "image/png" || input.image.size !== EXPECTED_IMAGE_SIZE) {
    throw new Error("The uploaded image does not match the approved PNG.");
  }
  const imageBytes = Buffer.from(await input.image.arrayBuffer());
  if (createHash("sha256").update(imageBytes).digest("hex") !== EXPECTED_IMAGE_SHA256) {
    throw new Error("The uploaded image hash does not match the approved giveaway graphic.");
  }

  let authorization = await getAuthorizedEtsyAccess(supabase);
  if (Number(authorization.connection.shop_id) !== SHOP_ID) {
    throw new Error("The stored Etsy connection is not the expected BaseCampNorthPA shop.");
  }
  if (!(authorization.connection.granted_scopes || []).includes("listings_w")) {
    throw new Error("The Etsy connection is missing listings_w.");
  }

  async function request<T>(method: EtsyMethod, path: string, bodyFactory?: () => BodyInit | undefined) {
    const pathname = new URL(path, "https://openapi.etsy.com").pathname;
    const readEndpoints = new Set([
      "/users/me",
      `/shops/${SHOP_ID}`,
      `/listings/${LISTING_ID}`,
      `/listings/${LISTING_ID}/images`,
      `/listings/${LISTING_ID}/inventory`
    ]);
    const allowed = method === "GET"
      ? readEndpoints.has(pathname)
      : method === "PATCH"
        ? pathname === `/shops/${SHOP_ID}/listings/${LISTING_ID}`
        : pathname === `/shops/${SHOP_ID}/listings/${LISTING_ID}/images`;
    if (!allowed) throw new Error(`Rejected unexpected Etsy endpoint: ${method} ${pathname}`);

    async function send() {
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
    console.info("Etsy one-time promo API response", { endpoint: path, status: response.status });
    if (!response.ok) {
      const safeMessage = await readEtsyErrorMessage(response, [
        authorization.accessToken,
        authorization.config.apiKey,
        authorization.config.sharedSecret,
        etsyApiKeyHeader(authorization.config)
      ]);
      throw new Error(`Etsy rejected ${method} ${path} (${response.status}): ${safeMessage}`);
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  const self = await request<{ shop_id?: number }>("GET", "/users/me");
  const shop = await request<{ shop_id?: number; shop_name?: string }>("GET", `/shops/${SHOP_ID}`);
  if (Number(self.shop_id) !== SHOP_ID || Number(shop.shop_id) !== SHOP_ID || shop.shop_name !== ETSY_EXPECTED_SHOP_NAME) {
    throw new Error("The authenticated Etsy identity is not BaseCampNorthPA.");
  }

  const beforeListing = await request<Listing>("GET", `/listings/${LISTING_ID}`);
  const beforeImages = orderedImages(await request<Page<ListingImage>>("GET", `/listings/${LISTING_ID}/images`));
  const beforeInventory = await request<unknown>("GET", `/listings/${LISTING_ID}/inventory`);
  const beforeDescription = decodeEtsyText(String(beforeListing.description || ""));
  if (Number(beforeListing.listing_id) !== LISTING_ID || Number(beforeListing.shop_id) !== SHOP_ID) {
    throw new Error("The live listing identity did not match the approved listing.");
  }
  if (beforeListing.title !== EXPECTED_TITLE) throw new Error("The live title changed; no update was made.");
  if (![ORIGINAL_DESCRIPTION, FINAL_DESCRIPTION].includes(beforeDescription)) {
    throw new Error("The live description differs from the backup; no update was made.");
  }
  if (countOccurrences(beforeDescription, PROMOTION) > 1) {
    throw new Error("The promotion already appears more than once; no update was made.");
  }
  if (!originalImagesRemainOrdered(beforeImages)) {
    throw new Error("The original image order differs from the backup; no update was made.");
  }
  const existingPromoImage = beforeImages.find((image) => image.alt_text === IMAGE_ALT_TEXT);
  if (!(beforeImages.length === 5 || (beforeImages.length === 6 && Number(existingPromoImage?.rank) === 6))) {
    throw new Error("Unexpected listing images were found; no update was made.");
  }

  if (beforeDescription === ORIGINAL_DESCRIPTION) {
    await request<Listing>("PATCH", `/shops/${SHOP_ID}/listings/${LISTING_ID}`, () =>
      new URLSearchParams({ description: FINAL_DESCRIPTION })
    );
    const descriptionReadback = await request<Listing>("GET", `/listings/${LISTING_ID}`);
    if (decodeEtsyText(String(descriptionReadback.description || "")) !== FINAL_DESCRIPTION) {
      throw new Error("The Etsy description read-back did not exactly match the approved text.");
    }
  }

  let uploadedImageId = Number(existingPromoImage?.listing_image_id) || 0;
  if (!existingPromoImage) {
    const uploaded = await request<ListingImage>("POST", `/shops/${SHOP_ID}/listings/${LISTING_ID}/images`, () => {
      const form = new FormData();
      form.append("image", new Blob([imageBytes], { type: "image/png" }), input.fileName);
      form.append("rank", "6");
      form.append("overwrite", "false");
      form.append("is_watermarked", "false");
      form.append("alt_text", IMAGE_ALT_TEXT);
      return form;
    });
    uploadedImageId = Number(uploaded.listing_image_id) || 0;
  }

  const finalListing = await request<Listing>("GET", `/listings/${LISTING_ID}`);
  const finalImages = orderedImages(await request<Page<ListingImage>>("GET", `/listings/${LISTING_ID}/images`));
  const finalInventory = await request<unknown>("GET", `/listings/${LISTING_ID}/inventory`);
  const finalDescription = decodeEtsyText(String(finalListing.description || ""));
  const finalImage = finalImages[5];
  const checks = {
    listingIdCorrect: Number(finalListing.listing_id) === LISTING_ID && Number(finalListing.shop_id) === SHOP_ID,
    titleUnchanged: finalListing.title === EXPECTED_TITLE,
    allOldImagesPresentInOrder: originalImagesRemainOrdered(finalImages),
    promoImageLast:
      finalImages.length === 6 && Number(finalImage?.rank) === 6 &&
      (Number(finalImage?.listing_image_id) === uploadedImageId || finalImage?.alt_text === IMAGE_ALT_TEXT),
    originalDescriptionIntact: finalDescription.startsWith(`${ORIGINAL_DESCRIPTION}\n\n`),
    promotionExactOnceAtBottom: finalDescription === FINAL_DESCRIPTION && countOccurrences(finalDescription, PROMOTION) === 1,
    otherListingFieldsUnchanged:
      stable(protectedListingFields(beforeListing)) === stable(protectedListingFields(finalListing)),
    inventoryUnchanged: stable(beforeInventory) === stable(finalInventory)
  };
  if (Object.values(checks).some((value) => !value)) {
    throw new Error(`Final Etsy verification failed: ${JSON.stringify(checks)}`);
  }

  return {
    listingId: LISTING_ID,
    promotionalImageAdded: !existingPromoImage,
    imagePosition: 6,
    finalImageCount: finalImages.length,
    descriptionPromotionAppended: beforeDescription === ORIGINAL_DESCRIPTION,
    existingDescriptionPreserved: true,
    otherListingFieldsChanged: false,
    etsyUpdateSuccessful: true,
    checks
  };
}
