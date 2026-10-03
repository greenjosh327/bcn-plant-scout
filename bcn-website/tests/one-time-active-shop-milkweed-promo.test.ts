import assert from "node:assert/strict";
import test from "node:test";
import {
  descriptionWithShopPromotion,
  SHOP_MILKWEED_PROMOTION
} from "../lib/one-time-active-shop-milkweed-promo";

test("appends the exact shop promotion without changing existing description text", () => {
  const existing = "Original product description.  ";
  assert.equal(descriptionWithShopPromotion(existing), `${existing}\n\n${SHOP_MILKWEED_PROMOTION}`);
});

test("uses the promotion alone when a product description is empty", () => {
  assert.equal(descriptionWithShopPromotion(""), SHOP_MILKWEED_PROMOTION);
});
