import { getCatalogProducts } from "../catalog-db";
import { getVariationKey, normalizeCartLines, type CartLine } from "../cart";
import type { Product, ProductVariation } from "../types";
import { productToShippingCartItem } from "./cart-items";
import type { ShippingCartItem } from "./types";

export class CheckoutCartError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CheckoutCartError";
    this.status = status;
  }
}

export type CheckoutCartItem = {
  product: Product;
  variant?: ProductVariation;
  variantKey?: string;
  price: number;
  inventory: number;
  quantity: number;
};

export type CheckoutCart = {
  lines: CartLine[];
  items: CheckoutCartItem[];
  shippingItems: ShippingCartItem[];
  subtotalCents: number;
};

export async function buildCheckoutCart(rawLines: CartLine[]): Promise<CheckoutCart> {
  const lines = normalizeCartLines(rawLines);
  if (lines.length === 0) {
    throw new CheckoutCartError("Your cart is empty.");
  }

  const products = await getCatalogProducts();
  const items = lines.map((line) => {
    const product = products.find((item) => item.id === line.productId);
    if (!product) return null;
    const variant = product.variations?.find((option) => getVariationKey(option) === line.variantKey);
    if (product.variations && product.variations.length > 0 && !variant) return null;
    const inventory = variant?.inventory ?? product.inventory;
    const price = variant?.price ?? product.price;
    const quantity = Math.min(line.quantity, inventory);
    return {
      product,
      variant,
      variantKey: variant ? getVariationKey(variant) : undefined,
      price,
      inventory,
      quantity
    };
  });

  if (items.some((item) => !item || item.quantity <= 0)) {
    throw new CheckoutCartError("One or more cart items are no longer available.");
  }

  const checkoutItems = items as CheckoutCartItem[];

  return {
    lines,
    items: checkoutItems,
    shippingItems: checkoutItems.map((item) => productToShippingCartItem(item.product, item.quantity, item.variantKey)),
    subtotalCents: checkoutItems.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0)
  };
}
