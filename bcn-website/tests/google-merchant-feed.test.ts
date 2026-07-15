import assert from "node:assert/strict";
import test from "node:test";
import { buildGoogleMerchantFeed } from "@/lib/marketing/google-merchant-feed";
import type { Product } from "@/lib/types";

function product(overrides: Partial<Product>): Product {
  return {
    id: "prod_test",
    slug: "prairifire-crabapple-seeds",
    name: "Prairifire Crabapple Seeds",
    scientificName: "Malus",
    commonName: "Crabapple",
    category: "Seeds",
    description: "Seed packet for wildlife plantings.",
    price: 5,
    inventory: 2,
    featured: true,
    active: true,
    images: ["/images/test.webp"],
    plantType: "",
    nativeStatus: "",
    hardinessZones: "",
    sunlight: "",
    soil: "",
    height: "",
    spread: "",
    bloomTime: "",
    wildlifeBenefits: "",
    pollinatorBenefits: "",
    hostSpecies: "",
    shippingNotes: "",
    growingNotes: "",
    localPickup: true,
    ships: true,
    tags: [],
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

test("Google Merchant feed includes only the first ad seed products", () => {
  const feed = buildGoogleMerchantFeed([
    product({
      id: "prod_honey",
      slug: "honey-locust-seeds-fast-growing-tree-deer-food-wildlife-permaculture",
      name: "Honey Locust Seeds",
      price: 5.99
    }),
    product({
      id: "prod_other",
      slug: "staghorn-sumac-seeds",
      name: "Staghorn Sumac Seeds"
    }),
    product({
      id: "prod_crabapple",
      slug: "prairifire-crabapple-seeds",
      name: "Prairifire Crabapple Seeds"
    })
  ], "https://shop.basecampnorthpa.com/");

  assert.match(feed, /<rss version="2.0"/);
  assert.match(feed, /Honey Locust Seeds/);
  assert.match(feed, /Prairifire Crabapple Seeds/);
  assert.doesNotMatch(feed, /Staghorn Sumac Seeds/);
  assert.match(feed, /<g:price>5.99 USD<\/g:price>/);
  assert.match(feed, /<g:price>2.00 USD<\/g:price>/);
  assert.match(feed, /https:\/\/shop.basecampnorthpa.com\/shop\/product\/prairifire-crabapple-seeds/);
});
