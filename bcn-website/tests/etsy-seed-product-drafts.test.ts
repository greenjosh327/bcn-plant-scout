import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSeedProductDraftInventoryPayload,
  SEED_PRODUCT_DRAFTS,
  seedProductDraftMatchesExistingTitle
} from "../lib/etsy/seed-product-drafts";

describe("fixed owner-approved Etsy seed product drafts", () => {
  it("keeps both titles and all Etsy tags within current limits", () => {
    assert.equal(SEED_PRODUCT_DRAFTS.length, 2);
    for (const product of SEED_PRODUCT_DRAFTS) {
      assert.ok(product.title.length <= 140);
      assert.equal(product.tags.length, 13);
      assert.equal(product.tags.every((tag) => tag.length <= 20), true);
      assert.equal(product.variants.length, 2);
    }
  });

  it("builds Etsy-valid enabled zero-quantity 25 and 100 seed offerings", () => {
    for (const product of SEED_PRODUCT_DRAFTS) {
      const payload = buildSeedProductDraftInventoryPayload(product, 123);
      assert.deepEqual(payload.price_on_property, [513]);
      assert.deepEqual(payload.quantity_on_property, [513]);
      assert.deepEqual(payload.sku_on_property, [513]);
      assert.deepEqual(payload.products.map((entry) => entry.property_values[0].values[0]), ["25 Seeds", "100 Seeds"]);
      assert.deepEqual(payload.products.map((entry) => entry.offerings[0].quantity), [0, 0]);
      assert.deepEqual(payload.products.map((entry) => entry.offerings[0].is_enabled), [true, true]);
      assert.deepEqual(payload.products.map((entry) => entry.offerings[0].readiness_state_id), [123, 123]);
    }
  });

  it("detects duplicates by exact title, scientific name, or product title prefix", () => {
    for (const product of SEED_PRODUCT_DRAFTS) {
      assert.equal(seedProductDraftMatchesExistingTitle(product, product.title), true);
      assert.equal(seedProductDraftMatchesExistingTitle(product, `Different title (${product.scientificName})`), true);
      assert.equal(seedProductDraftMatchesExistingTitle(product, `${product.commonName} Seeds - alternate wording`), true);
      assert.equal(seedProductDraftMatchesExistingTitle(product, "Unrelated seed listing"), false);
    }
  });
});
