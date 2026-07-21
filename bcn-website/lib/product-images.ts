import type { Product, ProductCategory, ProductImage } from "./types";

export const DEFAULT_PRODUCT_IMAGE_URL = "/images/scout-seedling-tray.webp";

type ProductImageOwner = Pick<Product, "name" | "category" | "images" | "imageDetails">;

export function getProductImages(product: ProductImageOwner): ProductImage[] {
  const imageDetails = product.imageDetails?.filter((image) => image.url.trim()) ?? [];
  if (imageDetails.length > 0) {
    return imageDetails.map((image, index) => ({
      ...image,
      altText: getProductImageAltText(product, image.altText, index)
    }));
  }

  const imageUrls = product.images.filter((image) => image.trim());
  if (imageUrls.length > 0) {
    return imageUrls.map((url, index) => ({
      url,
      altText: getProductImageAltText(product, undefined, index),
      isPrimary: index === 0,
      sortOrder: index
    }));
  }

  return [getFallbackProductImage(product)];
}

export function getPrimaryProductImage(product: ProductImageOwner) {
  const images = getProductImages(product);
  return images.find((image) => image.isPrimary) ?? images[0] ?? getFallbackProductImage(product);
}

export function getFallbackProductImage(product: Pick<Product, "name" | "category">): ProductImage {
  return {
    url: DEFAULT_PRODUCT_IMAGE_URL,
    altText: getProductImageAltText(product),
    isPrimary: true,
    sortOrder: 0,
    isFallback: true
  };
}

export function getProductImageAltText(
  product: Pick<Product, "name" | "category">,
  storedAltText?: string | null,
  index = 0
) {
  const stored = cleanAltText(storedAltText);
  if (stored) return stored;

  const name = cleanAltText(product.name) || "Base Camp North product";
  if (index > 0) return name;

  return buildContextualAltText(name, product.category);
}

function buildContextualAltText(name: string, category: ProductCategory) {
  if (category === "Seeds") return `${name} seeds offered by Base Camp North`;
  if (category === "Plants") return `${name} nursery plant offered by Base Camp North`;
  if (category === "Cuttings") return `${name} cuttings offered by Base Camp North`;
  return name;
}

function cleanAltText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}
