import assert from "node:assert/strict";
import test from "node:test";
import { getPrimaryProductImage } from "@/lib/product-images";
import {
  buildAbsoluteImageUrl,
  buildCanonicalUrl,
  buildProductMetaDescription,
  buildProductMetadata,
  cleanMetaDescription
} from "@/lib/seo";
import type { Product } from "@/lib/types";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod_test",
    slug: "test-product",
    name: "Test Product Seeds",
    scientificName: "Testus plantus",
    commonName: "Test Product",
    category: "Seeds",
    description: "Useful seed packet for habitat planting and nursery work.",
    price: 5,
    inventory: 3,
    featured: true,
    active: true,
    images: ["/images/scout-nut-pile.webp"],
    plantType: "Seed nursery item",
    nativeStatus: "",
    hardinessZones: "",
    sunlight: "Full Sun",
    soil: "Well-drained",
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

test("canonical URLs ignore query strings and normalize to the production origin", () => {
  assert.equal(
    buildCanonicalUrl("/shop?category=Seeds&sort=price-low"),
    "https://basecampnorthpa.com/shop"
  );
  assert.equal(
    buildCanonicalUrl("https://www.example.com/shop/product/test-product?utm=test"),
    "https://basecampnorthpa.com/shop/product/test-product"
  );
});

test("meta descriptions remove markup, whitespace, and avoid mid-word truncation", () => {
  assert.equal(
    cleanMetaDescription("<p>Native seeds&nbsp; for\n  habitat planting and restoration projects across Pennsylvania.</p>", 54),
    "Native seeds for habitat planting and restoration."
  );
});

test("product metadata uses product-specific text, canonical URL, and image alt text", () => {
  const item = product({
    slug: "prairifire-crabapple-seeds",
    name: "Prairifire Crabapple Seeds",
    imageDetails: [
      {
        url: "/images/scout-nut-pile.webp",
        altText: "Prairifire Crabapple seed packet",
        isPrimary: true,
        sortOrder: 0
      }
    ]
  });
  const metadata = buildProductMetadata(item);
  const openGraph = metadata.openGraph as Record<string, unknown>;
  const images = openGraph.images as Array<Record<string, unknown>>;

  assert.equal(metadata.title, "Prairifire Crabapple Seeds");
  assert.equal((metadata.alternates as Record<string, string>).canonical, "https://basecampnorthpa.com/shop/product/prairifire-crabapple-seeds");
  assert.equal(openGraph.url, "https://basecampnorthpa.com/shop/product/prairifire-crabapple-seeds");
  assert.equal(images[0].url, "https://basecampnorthpa.com/images/scout-nut-pile.webp");
  assert.equal(images[0].alt, "Prairifire Crabapple seed packet");
});

test("product metadata falls back safely when product descriptions or images are weak", () => {
  const item = product({
    description: "100 Seeds",
    images: [],
    imageDetails: []
  });
  const metadata = buildProductMetadata(item);
  const openGraph = metadata.openGraph as Record<string, unknown>;
  const images = openGraph.images as Array<Record<string, unknown>>;

  assert.equal(
    buildProductMetaDescription(item),
    "Test Product Seeds is a Base Camp North seed listing with notes for Testus plantus, Test Product, Full Sun."
  );
  assert.equal(images[0].url, "https://basecampnorthpa.com/images/bcn-logo.png");
});

test("product image helpers use stored alt text and reject expiring social image URLs", () => {
  const item = product({
    imageDetails: [
      {
        url: "https://example.supabase.co/storage/v1/object/sign/product-images/test.jpg?token=abc",
        altText: "Stored catalog alt text",
        isPrimary: true
      }
    ]
  });

  assert.equal(getPrimaryProductImage(item).altText, "Stored catalog alt text");
  assert.equal(buildAbsoluteImageUrl(item.imageDetails?.[0]?.url), "");
});
