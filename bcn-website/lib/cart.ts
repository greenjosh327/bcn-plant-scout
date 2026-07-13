import type { Product } from "./types";

export type CartLine = {
  productId: string;
  variantKey?: string;
  quantity: number;
};

export type CartProduct = Pick<
  Product,
  | "id"
  | "slug"
  | "name"
  | "scientificName"
  | "category"
  | "price"
  | "inventory"
  | "images"
  | "shippingClass"
  | "shippingEnabled"
  | "localPickupEnabled"
  | "shippingConfigurationComplete"
  | "ships"
  | "localPickup"
  | "variations"
>;

export const CART_STORAGE_KEY = "bcn_cart_v1";

export function getVariationKey(variation: NonNullable<Product["variations"]>[number]) {
  return variation.id || variation.sku || variation.name;
}

export function normalizeCartLines(lines: CartLine[]) {
  const grouped = new Map<string, number>();
  const lineMeta = new Map<string, Pick<CartLine, "productId" | "variantKey">>();

  for (const line of lines) {
    if (!line.productId) continue;
    const variantKey = line.variantKey || undefined;
    const key = `${line.productId}::${variantKey ?? ""}`;
    const nextQuantity = Math.max(1, Math.min(99, Number(line.quantity) || 1));
    grouped.set(key, (grouped.get(key) ?? 0) + nextQuantity);
    lineMeta.set(key, { productId: line.productId, variantKey });
  }

  return Array.from(grouped.entries()).map(([key, quantity]) => ({
    ...lineMeta.get(key)!,
    quantity
  }));
}

export function pruneCartLinesForProducts(lines: CartLine[], products: CartProduct[]) {
  const productsById = new Map(products.map((product) => [product.id, product]));

  return normalizeCartLines(lines).filter((line) => {
    const product = productsById.get(line.productId);
    if (!product) return false;
    if (!line.variantKey) return true;
    return Boolean(product.variations?.some((variation) => getVariationKey(variation) === line.variantKey));
  });
}

export function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(amount);
}
