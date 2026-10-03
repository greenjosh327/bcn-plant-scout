import { createHash } from "node:crypto";
import type { SupabaseServiceClient } from "@/lib/admin-api";

const PRODUCT_IMAGE_BUCKET = "product-images";
const PROMO_STORAGE_PATH = "promotions/milkweed-giveaway-efbb7a56869b1272d.png";
const PROMO_IMAGE_ALT = "Free Common Milkweed Seeds with every Base Camp North order";
const EXPECTED_IMAGE_SHA256 = "efbb7a56869b1272d1fde0627aa246e7651f414a3d355968651ec0ddfc1d35e3";
const EXPECTED_IMAGE_SIZE = 2_871_950;

const EXPECTED_ACTIVE_PRODUCT_IDS = [
  "prod_0b70691c-58ab-45d0-b392-87f19b0433bf",
  "prod_373a4d3c-96b8-493b-a1b1-edf62ada5fb5",
  "prod_421e91b1-62b3-45cd-bf14-9b33caf373b8",
  "prod_524e7b06-d18c-4fe7-a74e-96c7a0e1bd4a",
  "prod_6365ffae-5dda-4d0c-84e6-90b20469d2b1",
  "prod_american-hybrid-chestnut-bareroot",
  "prod_bb82b070-4894-4f5e-b332-660b47584560",
  "prod_c747934f-4a0c-4850-a205-e90a8c1f0dc5",
  "prod_carolina-snailseed-seeds",
  "prod_common-milkweed-seeds",
  "prod_ginkgo-seeds",
  "prod_honey-locust-seeds-fast-growing-tree-deer-food-wildlife-permaculture",
  "prod_kentucky-coffeetree-seeds",
  "prod_maypop-seeds",
  "prod_native-berry-food-forest-seed-collection",
  "prod_pennsylvania-native-seed-collection",
  "prod_prairifire-crabapple-seeds",
  "prod_raised-planter-ceder",
  "prod_smooth-sumac-seeds",
  "prod_staghorn-sumac-seeds",
  "prod_swamp-chestnut-oak-acorns",
  "prod_virginia-creeper-seeds",
  "prod_washington-hawthorn-seeds",
  "prod_wild-grape-seeds",
  "prod_wildlife-habitat-seed-collection",
  "prod_witch-hazel-seeds"
].sort();

export const SHOP_MILKWEED_PROMOTION = `🎁 FREE MILKWEED SEEDS WITH EVERY ORDER!

Every Base Camp North order includes a FREE packet of 25 Common Milkweed Seeds (Asclepias syriaca). Help support monarch butterflies, pollinators, and native wildlife habitat—one planting at a time.

No code needed. Your free seeds will automatically be included with your order.`;

type ProductRow = Record<string, unknown> & {
  id: string;
  slug: string;
  name: string;
  description: string;
  active: boolean;
};

type ImageRow = Record<string, unknown> & {
  id: string;
  product_id: string;
  storage_path: string | null;
  public_url: string | null;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
};

type VariantRow = Record<string, unknown> & {
  id: string;
  product_id: string;
};

type CatalogSnapshot = {
  products: ProductRow[];
  images: ImageRow[];
  variants: VariantRow[];
};

type ProductAudit = {
  id: string;
  slug: string;
  name: string;
  descriptionState: "missing" | "complete" | "conflict";
  imageState: "missing" | "complete" | "conflict";
  imageCount: number;
  proposedImageSortOrder: number;
  blockers: string[];
};

export type ShopPromoResult = {
  productId: string;
  slug: string;
  name: string;
  descriptionAppended: boolean;
  imageAdded: boolean;
  imagePosition: number;
  verified: boolean;
};

export class ShopPromoError extends Error {
  constructor(
    message: string,
    public readonly completed: ShopPromoResult[] = [],
    public readonly productId: string | null = null
  ) {
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

function countOccurrences(value: string, search: string) {
  return value.split(search).length - 1;
}

export function descriptionWithShopPromotion(description: string) {
  return description ? `${description}\n\n${SHOP_MILKWEED_PROMOTION}` : SHOP_MILKWEED_PROMOTION;
}

function displayOrderedImages(images: ImageRow[]) {
  return [...images].sort(
    (left, right) =>
      Number(Boolean(right.is_primary)) - Number(Boolean(left.is_primary)) ||
      Number(left.sort_order) - Number(right.sort_order) ||
      left.id.localeCompare(right.id)
  );
}

function rowsById<T extends { id: string }>(rows: T[]) {
  return [...rows].sort((left, right) => left.id.localeCompare(right.id));
}

function omitMutableProductFields(product: ProductRow) {
  return Object.fromEntries(
    Object.entries(product).filter(([key]) => key !== "description" && key !== "updated_at")
  );
}

function imageIdForProduct(productId: string) {
  return `img_milkweed_promo_${createHash("sha256").update(productId).digest("hex").slice(0, 24)}`;
}

async function readCatalogSnapshot(supabase: SupabaseServiceClient): Promise<CatalogSnapshot> {
  const { data: products, error: productError } = await supabase
    .from("products")
    .select("*")
    .eq("active", true)
    .order("id", { ascending: true });
  if (productError) throw new ShopPromoError(`Could not read active BCN products: ${productError.message}`);

  const ids = (products || []).map((product) => String(product.id));
  if (!ids.length) return { products: [], images: [], variants: [] };
  const [{ data: images, error: imageError }, { data: variants, error: variantError }] = await Promise.all([
    supabase.from("product_images").select("*").in("product_id", ids),
    supabase.from("product_variants").select("*").in("product_id", ids)
  ]);
  if (imageError) throw new ShopPromoError(`Could not read BCN product images: ${imageError.message}`);
  if (variantError) throw new ShopPromoError(`Could not read BCN product variants: ${variantError.message}`);

  return {
    products: (products || []) as ProductRow[],
    images: (images || []) as ImageRow[],
    variants: (variants || []) as VariantRow[]
  };
}

function auditProduct(product: ProductRow, allImages: ImageRow[]): ProductAudit {
  const images = displayOrderedImages(allImages.filter((image) => image.product_id === product.id));
  const promoRows = images.filter(
    (image) => image.storage_path === PROMO_STORAGE_PATH || image.alt_text === PROMO_IMAGE_ALT
  );
  const promoCount = countOccurrences(product.description || "", SHOP_MILKWEED_PROMOTION);
  const descriptionState = promoCount === 0
    ? "missing"
    : promoCount === 1 && (product.description || "").endsWith(SHOP_MILKWEED_PROMOTION)
      ? "complete"
      : "conflict";
  const finalImage = images[images.length - 1];
  const imageState = promoRows.length === 0
    ? "missing"
    : promoRows.length === 1 && promoRows[0].storage_path === PROMO_STORAGE_PATH && finalImage?.id === promoRows[0].id
      ? "complete"
      : "conflict";
  const blockers: string[] = [];
  if (descriptionState === "conflict") blockers.push("The promotion text already exists but is not the exact single suffix.");
  if (imageState === "conflict") blockers.push("A milkweed promotion image exists but is duplicated, unexpected, or not last.");
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    descriptionState,
    imageState,
    imageCount: images.length,
    proposedImageSortOrder: Math.max(-1, ...images.map((image) => Number(image.sort_order))) + 1,
    blockers
  };
}

export async function auditAllActiveShopMilkweedPromo(supabase: SupabaseServiceClient) {
  const snapshot = await readCatalogSnapshot(supabase);
  const actualIds = snapshot.products.map((product) => product.id).sort();
  const exactExpectedSet = stable(actualIds) === stable(EXPECTED_ACTIVE_PRODUCT_IDS);
  const products = snapshot.products.map((product) => auditProduct(product, snapshot.images));
  const blockers = products.flatMap((product) => product.blockers.map((message) => `${product.id}: ${message}`));
  if (!exactExpectedSet) {
    blockers.unshift(
      `The active BCN product set changed. Expected ${EXPECTED_ACTIVE_PRODUCT_IDS.length}; found ${actualIds.length}.`
    );
  }
  return {
    activeProductCount: snapshot.products.length,
    exactExpectedSet,
    ready: blockers.length === 0,
    blockers,
    products,
    backup: snapshot
  };
}

async function ensureSharedPromoAsset(supabase: SupabaseServiceClient, imageBytes: Buffer) {
  const bucket = supabase.storage.from(PRODUCT_IMAGE_BUCKET);
  const upload = await bucket.upload(PROMO_STORAGE_PATH, imageBytes, {
    cacheControl: "31536000",
    contentType: "image/png",
    upsert: false
  });
  if (upload.error) {
    const existing = await bucket.download(PROMO_STORAGE_PATH);
    if (existing.error || !existing.data) {
      throw new ShopPromoError(`Could not store the approved promotion image: ${upload.error.message}`);
    }
    const existingBytes = Buffer.from(await existing.data.arrayBuffer());
    const existingHash = createHash("sha256").update(existingBytes).digest("hex");
    if (existingBytes.length !== EXPECTED_IMAGE_SIZE || existingHash !== EXPECTED_IMAGE_SHA256) {
      throw new ShopPromoError("The existing shared promotion image does not match the approved PNG.");
    }
  }
  return bucket.getPublicUrl(PROMO_STORAGE_PATH).data.publicUrl;
}

async function readProductState(supabase: SupabaseServiceClient, productId: string) {
  const [{ data: product, error: productError }, { data: images, error: imageError }, { data: variants, error: variantError }] =
    await Promise.all([
      supabase.from("products").select("*").eq("id", productId).single(),
      supabase.from("product_images").select("*").eq("product_id", productId),
      supabase.from("product_variants").select("*").eq("product_id", productId)
    ]);
  if (productError || imageError || variantError || !product) {
    throw new ShopPromoError(
      productError?.message || imageError?.message || variantError?.message || "Could not verify the BCN product.",
      [],
      productId
    );
  }
  return {
    product: product as ProductRow,
    images: (images || []) as ImageRow[],
    variants: (variants || []) as VariantRow[]
  };
}

export async function applyAllActiveShopMilkweedPromo(
  supabase: SupabaseServiceClient,
  input: { image: Blob }
) {
  if (input.image.type !== "image/png" || input.image.size !== EXPECTED_IMAGE_SIZE) {
    throw new ShopPromoError("The uploaded image does not match the approved PNG.");
  }
  const imageBytes = Buffer.from(await input.image.arrayBuffer());
  if (createHash("sha256").update(imageBytes).digest("hex") !== EXPECTED_IMAGE_SHA256) {
    throw new ShopPromoError("The uploaded image hash does not match the approved giveaway graphic.");
  }

  const preflight = await auditAllActiveShopMilkweedPromo(supabase);
  if (!preflight.ready || !preflight.exactExpectedSet) {
    throw new ShopPromoError(preflight.blockers.join(" ") || "The BCN promotion preflight failed.");
  }
  const publicUrl = await ensureSharedPromoAsset(supabase, imageBytes);
  const completed: ShopPromoResult[] = [];

  for (const audit of preflight.products) {
    const beforeProduct = preflight.backup.products.find((product) => product.id === audit.id);
    if (!beforeProduct) throw new ShopPromoError("The preflight product snapshot is missing.", completed, audit.id);
    const beforeImages = preflight.backup.images.filter((image) => image.product_id === audit.id);
    const beforeVariants = preflight.backup.variants.filter((variant) => variant.product_id === audit.id);
    const expectedDescription = audit.descriptionState === "complete"
      ? beforeProduct.description
      : descriptionWithShopPromotion(beforeProduct.description || "");

    try {
      if (audit.imageState === "missing") {
        const { error } = await supabase.from("product_images").insert({
          id: imageIdForProduct(audit.id),
          product_id: audit.id,
          storage_path: PROMO_STORAGE_PATH,
          public_url: publicUrl,
          alt_text: PROMO_IMAGE_ALT,
          sort_order: audit.proposedImageSortOrder,
          is_primary: false
        });
        if (error) throw new Error(`Could not add the promotion image: ${error.message}`);
      }
      if (audit.descriptionState === "missing") {
        const { error } = await supabase.from("products").update({ description: expectedDescription }).eq("id", audit.id);
        if (error) throw new Error(`Could not append the promotion text: ${error.message}`);
      }

      const after = await readProductState(supabase, audit.id);
      const orderedAfterImages = displayOrderedImages(after.images);
      const finalImage = orderedAfterImages[orderedAfterImages.length - 1];
      const promoRows = after.images.filter((image) => image.storage_path === PROMO_STORAGE_PATH);
      const unchangedImages = after.images.filter((image) => image.storage_path !== PROMO_STORAGE_PATH);
      const checks = {
        identityAndState: after.product.id === audit.id && after.product.active === true,
        description:
          after.product.description === expectedDescription &&
          countOccurrences(after.product.description, SHOP_MILKWEED_PROMOTION) === 1,
        protectedProduct:
          stable(omitMutableProductFields(after.product)) === stable(omitMutableProductFields(beforeProduct)),
        existingImages: stable(rowsById(unchangedImages)) === stable(rowsById(beforeImages)),
        variants: stable(rowsById(after.variants)) === stable(rowsById(beforeVariants)),
        promoImage:
          promoRows.length === 1 &&
          promoRows[0].alt_text === PROMO_IMAGE_ALT &&
          promoRows[0].public_url === publicUrl &&
          promoRows[0].is_primary === false &&
          finalImage?.id === promoRows[0].id
      };
      if (Object.values(checks).some((value) => !value)) {
        throw new Error(`Final read-back failed: ${JSON.stringify(checks)}`);
      }
      completed.push({
        productId: audit.id,
        slug: audit.slug,
        name: audit.name,
        descriptionAppended: audit.descriptionState === "missing",
        imageAdded: audit.imageState === "missing",
        imagePosition: orderedAfterImages.length,
        verified: true
      });
    } catch (error) {
      throw new ShopPromoError(
        error instanceof Error ? error.message : "Unknown BCN catalog update error.",
        completed,
        audit.id
      );
    }
  }

  const finalAudit = await auditAllActiveShopMilkweedPromo(supabase);
  if (!finalAudit.exactExpectedSet || finalAudit.products.some((product) => product.descriptionState !== "complete" || product.imageState !== "complete")) {
    throw new ShopPromoError("The final all-product BCN read-back did not pass.", completed);
  }
  return {
    activeProductCount: preflight.activeProductCount,
    completedCount: completed.length,
    changedCount: completed.filter((product) => product.descriptionAppended || product.imageAdded).length,
    allVerified: completed.length === preflight.activeProductCount && completed.every((product) => product.verified),
    products: completed
  };
}
