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

export function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(amount);
}
