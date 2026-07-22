import assert from "node:assert/strict";
import test from "node:test";
import { decodeProductSlug, normalizeProductSlug } from "@/lib/product-slug";

test("product slugs are normalized for shop URLs", () => {
  assert.equal(normalizeProductSlug("Korean XL-chestnut-bareroot"), "korean-xl-chestnut-bareroot");
  assert.equal(normalizeProductSlug("Prairifire Crabapple (Malus 'Prairifire') - Seeds"), "prairifire-crabapple-malus-prairifire-seeds");
  assert.equal(normalizeProductSlug("Chestnuts & Wildlife Trees"), "chestnuts-and-wildlife-trees");
});

test("encoded product slugs can be decoded before lookup", () => {
  assert.equal(decodeProductSlug("Korean%20XL-chestnut-bareroot"), "Korean XL-chestnut-bareroot");
  assert.equal(decodeProductSlug("%"), "%");
});
