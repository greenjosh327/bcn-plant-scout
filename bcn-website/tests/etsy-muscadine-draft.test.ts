import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertMuscadineEtsyRequest,
  buildMuscadineDraftCreateBody,
  buildMuscadineInventoryPayload,
  flattenTaxonomy,
  MUSCADINE_DRAFT_DESCRIPTION,
  MUSCADINE_DRAFT_MATERIALS,
  MUSCADINE_DRAFT_TAGS,
  MUSCADINE_DRAFT_TITLE,
  MUSCADINE_DRAFT_VARIATIONS,
  verifyMuscadineInventory,
  type MuscadineDraftPreflight
} from "../lib/etsy/muscadine-draft";

const preflight: MuscadineDraftPreflight = {
  ready: true,
  fingerprint: "a".repeat(64),
  checkedAt: "2026-09-02T20:00:00.000Z",
  shop: { shopId: 62898597, shopName: "BaseCampNorthPA" },
  grantedScopes: ["shops_r", "listings_r", "listings_w", "transactions_r"],
  title: MUSCADINE_DRAFT_TITLE,
  titleLength: MUSCADINE_DRAFT_TITLE.length,
  taxonomy: { id: 123, name: "Seeds", path: "Craft Supplies & Tools > Seeds" },
  shippingProfile: { id: 456, title: "Seed Shipping", profileType: "calculated", originCountry: "US" },
  processingProfile: { id: 789, state: "ready_to_ship", minimumDays: 1, maximumDays: 3, label: "1 - 3 days" },
  physicalPackage: { weight: 2, weightUnit: "oz", length: 9, width: 6, height: 1, dimensionsUnit: "in" },
  referenceListing: { listingId: 4504040390, title: "Catalpa Seeds", state: "active" },
  existingDrafts: [],
  quantityPlan: "zero",
  blockers: [],
  warnings: []
};

test("Muscadine draft copy preserves required cautious claims and Etsy limits", () => {
  assert.equal(MUSCADINE_DRAFT_TITLE.length, 117);
  assert.equal(MUSCADINE_DRAFT_TAGS.length, 13);
  assert.equal(MUSCADINE_DRAFT_TAGS.every((tag) => tag.length <= 20), true);
  assert.deepEqual(MUSCADINE_DRAFT_MATERIALS, ["muscadine seeds", "untreated seeds"]);
  assert.match(MUSCADINE_DRAFT_DESCRIPTION, /no named cultivar is claimed/i);
  assert.match(MUSCADINE_DRAFT_DESCRIPTION, /individual seedlings may differ from the parent vine/i);
  assert.match(MUSCADINE_DRAFT_DESCRIPTION, /not intended for consumption/i);
  assert.doesNotMatch(MUSCADINE_DRAFT_DESCRIPTION, /certified organic|germination percentage|disease resistance/i);
});

test("draft creation body uses only the verified taxonomy and fulfillment profiles", () => {
  const body = buildMuscadineDraftCreateBody(preflight);
  assert.equal(body.get("quantity"), "1");
  assert.equal(body.get("title"), MUSCADINE_DRAFT_TITLE);
  assert.equal(body.get("taxonomy_id"), "123");
  assert.equal(body.get("shipping_profile_id"), "456");
  assert.equal(body.get("readiness_state_id"), "789");
  assert.equal(body.get("item_weight"), "2");
  assert.equal(body.get("item_weight_unit"), "oz");
  assert.equal(body.get("item_length"), "9");
  assert.equal(body.get("item_width"), "6");
  assert.equal(body.get("item_height"), "1");
  assert.equal(body.get("item_dimensions_unit"), "in");
  assert.equal(body.get("type"), "physical");
  assert.equal(body.get("should_auto_renew"), "false");
  assert.equal(body.get("state"), null);
  assert.equal(body.get("tags"), MUSCADINE_DRAFT_TAGS.join(","));
  assert.equal(body.get("materials"), MUSCADINE_DRAFT_MATERIALS.join(","));
});

test("inventory payload uses only Etsy's minimum required positive draft offering", () => {
  const payload = buildMuscadineInventoryPayload(789);
  assert.deepEqual(payload.price_on_property, [513]);
  assert.deepEqual(payload.quantity_on_property, [513]);
  assert.deepEqual(payload.sku_on_property, [513]);
  assert.deepEqual(payload.readiness_state_on_property, []);
  assert.deepEqual(
    payload.products.map((product) => ({
      sku: product.sku,
      name: product.property_values[0].values[0],
      price: product.offerings[0].price,
      quantity: product.offerings[0].quantity,
      enabled: product.offerings[0].is_enabled,
      readiness: product.offerings[0].readiness_state_id
    })),
    MUSCADINE_DRAFT_VARIATIONS.map((variation) => ({
      sku: variation.sku,
      name: variation.name,
      price: variation.price,
      quantity: variation.quantity,
      enabled: variation.isEnabled,
      readiness: 789
    }))
  );
});

test("inventory verification requires exact SKUs, prices, names, draft quantities, and enabled states", () => {
  const inventory = {
    products: MUSCADINE_DRAFT_VARIATIONS.map((variation, index) => ({
      product_id: 100 + index,
      sku: variation.sku,
      property_values: [{ property_id: 513, property_name: "Pack Size", value_ids: [1000 + index], values: [variation.name] }],
      offerings: [{
        offering_id: 200 + index,
        quantity: variation.quantity,
        is_enabled: variation.isEnabled,
        readiness_state_id: 789,
        price: { amount: Math.round(variation.price * 100), divisor: 100, currency_code: "USD" }
      }]
    })),
    price_on_property: [513],
    quantity_on_property: [513],
    sku_on_property: [513],
    readiness_state_on_property: []
  };
  assert.equal(verifyMuscadineInventory(inventory), true);
  inventory.products[1].offerings[0].quantity = 1;
  assert.equal(verifyMuscadineInventory(inventory), false);
});

test("draft endpoint guard cannot publish, patch, delete, renew, or update an existing listing", () => {
  assert.doesNotThrow(() => assertMuscadineEtsyRequest("POST", "/shops/62898597/listings"));
  assert.doesNotThrow(() => assertMuscadineEtsyRequest("PUT", "/listings/123/inventory"));
  assert.doesNotThrow(() => assertMuscadineEtsyRequest("POST", "/shops/62898597/listings/123/images"));
  assert.throws(() => assertMuscadineEtsyRequest("POST", "/shops/62898597/listings/123"));
  assert.throws(() => assertMuscadineEtsyRequest("PUT", "/shops/62898597/listings/123"));
  assert.throws(() => assertMuscadineEtsyRequest("GET", "/shops/62898597/receipts"));
  assert.throws(() => assertMuscadineEtsyRequest("POST", "/shops/62898597/readiness-state-definitions"));
});

test("taxonomy lookup keeps the current full Etsy category path", () => {
  const nodes = flattenTaxonomy([
    { id: 1, name: "Craft Supplies & Tools", children: [
      { id: 2, name: "Home & Hobby", children: [{ id: 3, name: "Seeds", children: [] }] }
    ] }
  ]);
  assert.deepEqual(nodes.find((node) => node.id === 3), {
    id: 3,
    name: "Seeds",
    path: "Craft Supplies & Tools > Home & Hobby > Seeds"
  });
});

test("the direct operation is single-use, server-only, and absent from the admin page", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260903011817_bcn_etsy_one_time_draft_operation.sql", import.meta.url),
    "utf8"
  );
  const operation = readFileSync(new URL("../lib/etsy/muscadine-operation.ts", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../components/admin-etsy-dashboard.tsx", import.meta.url), "utf8");

  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.etsy_one_time_draft_operations from public, anon, authenticated/i);
  assert.match(migration, /token_hash text/);
  assert.match(operation, /timingSafeEqual/);
  assert.match(operation, /token_hash: null/);
  assert.doesNotMatch(operation, /console\.(log|info|warn|error).*token/i);
  assert.doesNotMatch(dashboard, /MuscadineDraft|Create Muscadine/);
});
