import { createClient } from "@supabase/supabase-js";
import { products as fallbackProducts, getRelatedProducts as getFallbackRelatedProducts } from "./products";
import type { Product, ProductCategory, ProductVariation } from "./types";

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
  shipping_notes: string | null;
  growing_notes: string | null;
  local_pickup: boolean | null;
  ships: boolean | null;
  tags: string[] | null;
  source: Product["source"] | null;
  created_at: string | null;
  updated_at: string | null;
};

type DbVariant = {
  product_id: string;
  name: string;
  sku: string | null;
  price: number | string | null;
  inventory: number | null;
  active: boolean | null;
};

type DbImage = {
  product_id: string;
  public_url: string | null;
  storage_path: string | null;
  alt_text: string | null;
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

  const [{ data: variantRows }, { data: imageRows }] = await Promise.all([
    supabase.from("product_variants").select("*").in("product_id", productIds).eq("active", true).order("name", { ascending: true }),
    supabase.from("product_images").select("*").in("product_id", productIds).order("sort_order", { ascending: true })
  ]);

  return mapDbProducts(productRows as DbProduct[], (variantRows ?? []) as DbVariant[], (imageRows ?? []) as DbImage[]);
}

export async function getFeaturedCatalogProducts() {
  const products = await getCatalogProducts();
  return products.filter((product) => product.featured && product.active);
}

export async function getCatalogProductBySlug(slug: string) {
  const products = await getCatalogProducts();
  return products.find((product) => product.slug === slug);
}

export async function getRelatedCatalogProducts(product: Product) {
  const products = await getCatalogProducts();
  const related = products
    .filter((candidate) => candidate.active && candidate.slug !== product.slug)
    .filter((candidate) => candidate.category === product.category || candidate.tags.some((tag) => product.tags.includes(tag)))
    .slice(0, 3);

  return related.length > 0 ? related : getFallbackRelatedProducts(product);
}

function mapDbProducts(products: DbProduct[], variants: DbVariant[], images: DbImage[]): Product[] {
  return products.map((product) => {
    const productVariants = variants
      .filter((variant) => variant.product_id === product.id)
      .map<ProductVariation>((variant) => ({
        name: variant.name,
        sku: variant.sku ?? "",
        price: Number(variant.price) || 0,
        inventory: Number(variant.inventory) || 0
      }));

    const productImages = images
      .filter((image) => image.product_id === product.id)
      .map((image) => image.public_url || image.storage_path || "")
      .filter(Boolean);

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      scientificName: product.scientific_name ?? "",
      commonName: product.common_name ?? "",
      category: product.category,
      description: product.description ?? "",
      price: Number(product.price) || 0,
      inventory: Number(product.inventory) || 0,
      featured: Boolean(product.featured),
      active: product.active !== false,
      images: productImages.length > 0 ? productImages : ["/images/scout-seedling-tray.webp"],
      plantType: product.plant_type ?? "Nursery item",
      nativeStatus: product.native_status ?? "See product description",
      hardinessZones: product.hardiness_zones ?? "See product description",
      sunlight: product.sunlight ?? "See product description",
      soil: product.soil ?? "See product description",
      height: product.height ?? "See product description",
      spread: product.spread ?? "See product description",
      bloomTime: product.bloom_time ?? "See product description",
      wildlifeBenefits: product.wildlife_benefits ?? "Selected for nursery, wildlife, food forest, or restoration value.",
      pollinatorBenefits: product.pollinator_benefits ?? "See product description for bloom and pollinator notes.",
      hostSpecies: product.host_species ?? "See product description",
      shippingNotes: product.shipping_notes ?? "Shipping and pickup availability depends on item size, season, and live-plant condition.",
      growingNotes: product.growing_notes ?? product.description ?? "",
      localPickup: product.local_pickup !== false,
      ships: Boolean(product.ships),
      tags: product.tags ?? [],
      variations: productVariants,
      source: product.source ?? "manual",
      createdAt: product.created_at ?? "",
      updatedAt: product.updated_at ?? ""
    };
  });
}
