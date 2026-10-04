import assert from "node:assert/strict";
import test from "node:test";
import {
  BCN_BOTTLEBRUSH_DESCRIPTION,
  BOTTLEBRUSH_MATERIALS,
  BOTTLEBRUSH_SKU,
  BOTTLEBRUSH_TAGS,
  BOTTLEBRUSH_TITLE,
  bottlebrushInventoryPayload,
  ETSY_BOTTLEBRUSH_DESCRIPTION
} from "../lib/etsy/one-time-bottlebrush-buckeye";

test("Bottlebrush Buckeye listing copy stays within Etsy limits and includes safety guidance", () => {
  assert.ok(BOTTLEBRUSH_TITLE.length <= 140);
  assert.equal(BOTTLEBRUSH_TAGS.length, 13);
  assert.ok(BOTTLEBRUSH_TAGS.every((tag) => tag.length <= 20));
  assert.ok(BOTTLEBRUSH_MATERIALS.length > 0);
  assert.match(BCN_BOTTLEBRUSH_DESCRIPTION, /poisonous if ingested/i);
  assert.match(BCN_BOTTLEBRUSH_DESCRIPTION, /must not be allowed to dry out/i);
  assert.match(BCN_BOTTLEBRUSH_DESCRIPTION, /FREE MILKWEED SEEDS WITH EVERY ORDER/);
  assert.match(ETSY_BOTTLEBRUSH_DESCRIPTION, /DRAFT NOTE FOR SHOP OWNER/);
});

test("Bottlebrush Buckeye Etsy inventory is one draft-only Pack of 3 offering", () => {
  const payload = bottlebrushInventoryPayload(123);
  assert.deepEqual(payload.price_on_property, []);
  assert.deepEqual(payload.quantity_on_property, []);
  assert.equal(payload.products.length, 1);
  assert.equal(payload.products[0].sku, BOTTLEBRUSH_SKU);
  assert.deepEqual(payload.products[0].property_values, []);
  assert.equal(payload.products[0].offerings[0].quantity, 1);
  assert.equal(payload.products[0].offerings[0].price, 8);
  assert.equal(payload.products[0].offerings[0].is_enabled, true);
});
