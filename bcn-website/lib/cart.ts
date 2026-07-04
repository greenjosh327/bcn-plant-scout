import type { Product } from "./types";

export type CartLine = {
  productId: string;
  quantity: number;
};

export type CartProduct = Pick<Product, "id" | "slug" | "name" | "price" | "inventory" | "images" | "ships" | "localPickup">;

export const CART_STORAGE_KEY = "bcn_cart_v1";

export function normalizeCartLines(lines: CartLine[]) {
  const grouped = new Map<string, number>();

  for (const line of lines) {
    if (!line.productId) continue;
    const nextQuantity = Math.max(1, Math.min(99, Number(line.quantity) || 1));
    grouped.set(line.productId, (grouped.get(line.productId) ?? 0) + nextQuantity);
  }

  return Array.from(grouped.entries()).map(([productId, quantity]) => ({ productId, quantity }));
}

export function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(amount);
}
