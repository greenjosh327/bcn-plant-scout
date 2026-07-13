import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeCartLines, pruneCartLinesForProducts, type CartProduct } from "../lib/cart";

function product(overrides: Partial<CartProduct> = {}): CartProduct {
  return {
    id: "product-1",
    slug: "product-1",
    name: "Product 1",
    scientificName: "",
    category: "Plants",
    price: 10,
    inventory: 5,
    images: ["/image.jpg"],
    shippingClass: "small_package",
    shippingEnabled: true,
    localPickupEnabled: true,
    shippingConfigurationComplete: true,
    ships: true,
    localPickup: true,
    variations: [],
    ...overrides
  };
}

describe("cart helpers", () => {
  it("normalizes duplicate cart lines", () => {
    assert.deepEqual(
      normalizeCartLines([
        { productId: "product-1", quantity: 1 },
        { productId: "product-1", quantity: 2 }
      ]),
      [{ productId: "product-1", variantKey: undefined, quantity: 3 }]
    );
  });

  it("removes stale product and variant lines from saved carts", () => {
    const products = [
      product({
        id: "product-1",
        variations: [{ id: "small", name: "Small", sku: "SKU-S", price: 10, inventory: 3 }]
      })
    ];

    assert.deepEqual(
      pruneCartLinesForProducts([
        { productId: "missing-product", quantity: 1 },
        { productId: "product-1", variantKey: "missing-variant", quantity: 1 },
        { productId: "product-1", variantKey: "small", quantity: 2 }
      ], products),
      [{ productId: "product-1", variantKey: "small", quantity: 2 }]
    );
  });
});
