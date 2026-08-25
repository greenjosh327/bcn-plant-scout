import { createClient } from "@supabase/supabase-js";
import { calculateBundleAvailability, getVariantAvailableInventory } from "./inventory";
import { getFallbackProductImage, getProductImageAltText } from "./product-images";
import { decodeProductSlug, normalizeProductSlug, resolveProductSlugAlias } from "./product-slug";
import { products as fallbackProducts } from "./products";
import { isShippingClass } from "./shipping/types";
import type { BundleComponent, Product, ProductCategory, ProductImage, ProductType, ProductVariation } from "./types";

const PRODUCT_IMAGE_BUCKET = "product-images";

type DbProduct = {
  id: string;
  slug: string;
  name: string;
  scientific_name: string | null;
  common_name: string | null;
  category: ProductCategory;
  description: string | null;
  price: number | string | null;
  inventory: number | null;
  product_type: ProductType | null;
  featured: boolean | null;
  active: boolean | null;
  plant_type: string | null;
  native_status: string | null;
  hardiness_zones: string | null;
  sunlight: string | null;
  soil: string | null;
  height: string | null;
  spread: string | null;
  bloom_time: string | null;
  wildlife_benefits: string | null;
  pollinator_benefits: string | null;
  host_species: string | null;
  planting_instructions: string | null;
  shipping_notes: string | null;
  growing_notes: string | null;
  show_hardiness_zones: boolean | null;
  show_sunlight: boolean | null;
  show_soil: boolean | null;
  show_bloom_time: boolean | null;
  show_height: boolean | null;
  show_spread: boolean | null;
  show_native_status: boolean | null;
  show_wildlife_benefits: boolean | null;
  show_pollinator_benefits: boolean | null;
  show_host_species: boolean | null;
  shipping_class: string | null;
  shipping_enabled: boolean | null;
  local_pickup_enabled: boolean | null;
  packed_weight_oz: number | string | null;
  packed_length_in: number | string | null;
  packed_width_in: number | string | null;
  packed_height_in: number | string | null;
  ships_alone: boolean | null;
  expedited_required: boolean | null;
  allow_ground_advantage: boolean | null;
  free_shipping_eligible: boolean | null;
  shipping_surcharge_cents: number | null;
  max_quantity_per_package: number | null;
  preferred_package_id: string | null;
  shipping_configuration_complete: boolean | null;
  local_pickup: boolean | null;
  ships: boolean | null;
  tags: string[] | null;
  source: Product["source"] | null;
  created_at: string | null;
  updated_at: string | null;
};

type DbVariant = {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price: number | string | null;
  inventory: number | null;
  packs_consumed: number | null;
  active: boolean | null;
};

type DbImage = {
  product_id: string;
  public_url: string | null;
  storage_path: string | null;
  alt_text: string | null;
  is_primary: boolean | null;
  sort_order: number | null;
};

type DbBundleComponent = {
  id: string;
  bundle_product_id: string;
  component_product_id: string;
  component_variant_id: string | null;
  packs_consumed: number | null;
  sort_order: number | null;
};

function getSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export async function getCatalogProducts() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return fallbackProducts.filter((product) => product.active);

  const { data: productRows, error } = await supabase
    .from("products")
    .select("*")
    .eq("active", true)
    .order("featured", { ascending: false })
    .order("name", { ascending: true });

  if (error || !productRows) return fallbackProducts.filter((product) => product.active);

  const productIds = productRows.map((product) => product.id);
  if (productIds.length === 0) return [];

  const [{ data: variantRows }, { data: imageRows }, { data: bundleComponentRows }] = await Promise.all([
    supabase.from("product_variants").select("*").in("product_id", productIds).eq("active", true).order("name", { ascending: true }),
    supabase.from("product_images").select("*").in("product_id", productIds).order("sort_order", { ascending: true }),
    supabase.from("bundle_components").select("*").in("bundle_product_id", productIds).order("sort_order", { ascending: true })
  ]);

  return mapDbProducts(
    productRows as DbProduct[],
    (variantRows ?? []) as DbVariant[],
    (imageRows ?? []) as DbImage[],
    (bundleComponentRows ?? []) as DbBundleComponent[],
    supabase
  );
}

export async function getFeaturedCatalogProducts() {
  const products = await getCatalogProducts();
  return products.filter((product) => product.featured && product.active);
}

export async function getCatalogProductBySlug(slug: string) {
  const products = await getCatalogProducts();
  const decodedSlug = decodeProductSlug(slug);
  const normalizedSlug = normalizeProductSlug(decodedSlug);
  const canonicalSlug = resolveProductSlugAlias(normalizedSlug);

  return (
    products.find((product) => product.slug === slug || product.slug === decodedSlug || product.slug === canonicalSlug) ??
    products.find((product) => normalizeProductSlug(product.slug) === canonicalSlug)
  );
}

export async function getRelatedCatalogProducts(product: Product) {
  const products = await getCatalogProducts();
  return products
    .filter((candidate) => candidate.active && candidate.slug !== product.slug)
    .filter((candidate) => candidate.category === product.category || candidate.tags.some((tag) => product.tags.includes(tag)))
    .slice(0, 3);
}

function mapDbProducts(
  products: DbProduct[],
  variants: DbVariant[],
  images: DbImage[],
  bundleComponents: DbBundleComponent[],
  supabase: ReturnType<typeof getSupabaseServerClient>
): Product[] {
  const mappedProducts = products.map<Product>((product) => {
    const baseInventory = Number(product.inventory) || 0;
    const productVariants = variants
      .filter((variant) => variant.product_id === product.id)
      .map<ProductVariation>((variant) => ({
        id: variant.id,
        name: variant.name,
        sku: variant.sku ?? "",
        price: Number(variant.price) || 0,
        inventory: Number(variant.inventory) || 0,
        packsConsumed: Math.max(1, Number(variant.packs_consumed) || 1)
      }));
    const displayVariants = productVariants.map((variant) => ({
      ...variant,
      inventory: product.category === "Seeds" ? getVariantAvailableInventory({ category: product.category, inventory: baseInventory }, variant) : variant.inventory
    }));

    const productImages = images
      .filter((image) => image.product_id === product.id)
      .sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)) || Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
      .map((image) => resolveProductImage(image, supabase, product))
      .filter((image): image is ProductImage => Boolean(image));

    const productImageDetails =
      productImages.length > 0 ? productImages : [getFallbackProductImage({ name: product.name, category: product.category })];

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      scientificName: product.scientific_name ?? "",
      commonName: product.common_name ?? "",
      category: product.category,
      description: product.description ?? "",
      price: Number(product.price) || 0,
      inventory: baseInventory,
      productType: (product.product_type === "bundle" ? "bundle" : "standard") as ProductType,
      featured: Boolean(product.featured),
      active: product.active !== false,
      images: productImageDetails.map((image) => image.url),
      imageDetails: productImageDetails,
      plantType: product.plant_type ?? "Nursery item",
      nativeStatus: cleanCatalogText(product.native_status),
      hardinessZones: cleanCatalogText(product.hardiness_zones),
      sunlight: cleanCatalogText(product.sunlight),
      soil: cleanCatalogText(product.soil),
      height: cleanCatalogText(product.height),
      spread: cleanCatalogText(product.spread),
      bloomTime: cleanCatalogText(product.bloom_time),
      wildlifeBenefits: cleanCatalogText(product.wildlife_benefits),
      pollinatorBenefits: cleanCatalogText(product.pollinator_benefits),
      hostSpecies: cleanCatalogText(product.host_species),
      shippingNotes: cleanCatalogText(product.shipping_notes),
      growingNotes: cleanCatalogText(product.growing_notes),
      plantingInstructions: cleanCatalogText(product.planting_instructions),
      showHardinessZones: product.show_hardiness_zones !== false,
      showSunlight: product.show_sunlight !== false,
      showSoil: product.show_soil !== false,
      showBloomTime: product.show_bloom_time !== false,
      showHeight: product.show_height !== false,
      showSpread: product.show_spread !== false,
      showNativeStatus: product.show_native_status !== false,
      showWildlifeBenefits: product.show_wildlife_benefits !== false,
      showPollinatorBenefits: product.show_pollinator_benefits !== false,
      showHostSpecies: product.show_host_species !== false,
      shippingClass: isShippingClass(product.shipping_class) ? product.shipping_class : "",
      shippingEnabled: Boolean(product.shipping_enabled),
      localPickupEnabled: product.local_pickup_enabled !== false,
      packedWeightOz: numberOrNull(product.packed_weight_oz),
      packedLengthIn: numberOrNull(product.packed_length_in),
      packedWidthIn: numberOrNull(product.packed_width_in),
      packedHeightIn: numberOrNull(product.packed_height_in),
      shipsAlone: Boolean(product.ships_alone),
      expeditedRequired: Boolean(product.expedited_required),
      allowGroundAdvantage: product.allow_ground_advantage !== false,
      freeShippingEligible: Boolean(product.free_shipping_eligible),
      shippingSurchargeCents: Number(product.shipping_surcharge_cents) || 0,
      maxQuantityPerPackage: Number(product.max_quantity_per_package) || 1,
      preferredPackageId: product.preferred_package_id ?? "",
      shippingConfigurationComplete: Boolean(product.shipping_configuration_complete),
      localPickup: product.local_pickup !== false,
      ships: Boolean(product.ships),
      tags: product.tags ?? [],
      variations: displayVariants,
      source: product.source ?? "manual",
      createdAt: product.created_at ?? "",
      updatedAt: product.updated_at ?? ""
    };
  });

  const productsById = new Map(mappedProducts.map((product) => [product.id, product]));
  return mappedProducts.map((product) => {
    if (product.productType !== "bundle") return product;

    const components = bundleComponents
      .filter((component) => component.bundle_product_id === product.id)
      .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
      .map<BundleComponent>((component) => {
        const componentProduct = productsById.get(component.component_product_id);
        const componentVariant = componentProduct?.variations?.find((variant) => variant.id === component.component_variant_id);
        return {
          id: component.id,
          bundleProductId: component.bundle_product_id,
          componentProductId: component.component_product_id,
          componentVariantId: component.component_variant_id,
          packsConsumed: Math.max(1, Number(component.packs_consumed) || 1),
          sortOrder: Number(component.sort_order) || 0,
          componentProduct: componentProduct
            ? {
                id: componentProduct.id,
                slug: componentProduct.slug,
                name: componentProduct.name,
                scientificName: componentProduct.scientificName,
                commonName: componentProduct.commonName,
                category: componentProduct.category,
                inventory: componentProduct.inventory,
                images: componentProduct.images,
                imageDetails: componentProduct.imageDetails,
                variations: componentProduct.variations
              }
            : undefined,
          componentVariant
        };
      });
    const bundleAvailability = calculateBundleAvailability(components);

    return {
      ...product,
      inventory: bundleAvailability.available,
      bundleComponents: components,
      bundleAvailability
    };
  });
}

function numberOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

const PLACEHOLDER_VALUES = new Set([
  "See product description",
  "See product description for bloom and pollinator notes.",
  "Selected for nursery, wildlife, food forest, or restoration value.",
  "Shipping and pickup availability depends on item size, season, and live-plant condition."
]);

function cleanCatalogText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || PLACEHOLDER_VALUES.has(trimmed)) return "";
  return trimmed;
}

function resolveProductImageUrl(image: DbImage, supabase: ReturnType<typeof getSupabaseServerClient>) {
  if (image.public_url) return image.public_url;
  if (!image.storage_path) return "";
  if (/^https?:\/\//i.test(image.storage_path) || image.storage_path.startsWith("/")) return image.storage_path;

  return supabase?.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(image.storage_path).data.publicUrl ?? "";
}

function resolveProductImage(
  image: DbImage,
  supabase: ReturnType<typeof getSupabaseServerClient>,
  product: Pick<Product, "name" | "category">
): ProductImage | null {
  const url = resolveProductImageUrl(image, supabase).trim();
  if (!url) return null;

  return {
    url,
    altText: getProductImageAltText(product, image.alt_text),
    isPrimary: Boolean(image.is_primary),
    sortOrder: image.sort_order
  };
}
