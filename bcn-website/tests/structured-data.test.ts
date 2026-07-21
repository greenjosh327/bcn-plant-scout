import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBreadcrumbList,
  buildBusinessEntity,
  buildContactPoints,
  buildProductEntity,
  buildProductPageStructuredData,
  buildProductOffers,
  buildWebsiteEntity,
  organizationId,
  serializeJsonLd,
  websiteId
} from "@/lib/structured-data";
import type { Product } from "@/lib/types";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod_internal",
    slug: "test-product",
    name: "Test Product Seeds",
    scientificName: "Testus plantus",
    commonName: "Test Product",
    category: "Seeds",
    description: "Useful <strong>seed packet</strong> for habitat planting.",
    price: 5,
    inventory: 3,
    featured: true,
    active: true,
    images: ["/images/scout-nut-pile.webp"],
    imageDetails: [
      {
        url: "/images/scout-nut-pile.webp",
        altText: "Stored seed image alt",
        isPrimary: true
      }
    ],
    plantType: "Seed nursery item",
    nativeStatus: "Pennsylvania",
    hardinessZones: "Zone 5",
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

test("safe JSON-LD serialization escapes HTML-sensitive characters and omits empty values", () => {
  const serialized = serializeJsonLd({
    "@context": "https://schema.org",
    "@type": "Thing",
    name: "<script>alert('x')</script> & seeds",
    empty: "",
    missing: undefined,
    child: { empty: "", value: "ok" }
  });
  const parsed = JSON.parse(serialized);

  assert.match(serialized, /\\u003cscript/);
  assert.match(serialized, /\\u0026 seeds/);
  assert.doesNotMatch(serialized, /undefined/);
  assert.equal(parsed.empty, undefined);
  assert.equal(parsed.missing, undefined);
  assert.deepEqual(parsed.child, { value: "ok" });
});

test("business and website entities use stable IDs and verified public values", () => {
  const business = buildBusinessEntity() as Record<string, unknown>;
  const website = buildWebsiteEntity() as Record<string, unknown>;

  assert.equal(business["@id"], "https://basecampnorthpa.com/#organization");
  assert.deepEqual(business["@type"], ["Organization", "GardenStore"]);
  assert.equal(business.url, "https://basecampnorthpa.com");
  assert.equal(business.logo, "https://basecampnorthpa.com/images/bcn-logo.png");
  assert.equal((website.publisher as Record<string, string>)["@id"], organizationId);
  assert.equal(website["@id"], websiteId);
});

test("contact points expose only public customer-facing email addresses", () => {
  const emails = buildContactPoints().map((point) => point.email).sort();

  assert.deepEqual(emails, [
    "info@basecampnorthpa.com",
    "orders@basecampnorthpa.com",
    "sales@basecampnorthpa.com",
    "support@basecampnorthpa.com"
  ]);
  assert.doesNotMatch(JSON.stringify(buildContactPoints()), /greenjosh327|gmail|josh@basecampnorthpa\.com/i);
});

test("product entity uses the canonical product URL, clean description, and public image", () => {
  const entity = buildProductEntity(product({ slug: "prairifire-crabapple-seeds" })) as Record<string, unknown>;

  assert.equal(entity["@id"], "https://basecampnorthpa.com/shop/product/prairifire-crabapple-seeds#product");
  assert.equal(entity.url, "https://basecampnorthpa.com/shop/product/prairifire-crabapple-seeds");
  assert.doesNotMatch(String(entity.description), /<strong>/);
  assert.deepEqual(entity.image, ["https://basecampnorthpa.com/images/scout-nut-pile.webp"]);
  assert.equal((entity.brand as Record<string, string>).name, "Base Camp North");
});

test("product image schema rejects signed URLs and omits missing images", () => {
  const signedImageProduct = product({
    imageDetails: [
      {
        url: "https://example.supabase.co/storage/v1/object/sign/product-images/test.jpg?token=abc",
        altText: "Signed image",
        isPrimary: true
      }
    ]
  });
  const noImageProduct = product({ images: [], imageDetails: [] });

  assert.equal((buildProductEntity(signedImageProduct) as Record<string, unknown>).image, undefined);
  assert.equal((buildProductEntity(noImageProduct) as Record<string, unknown>).image, undefined);
});

test("single-price products produce a valid Offer", () => {
  const offers = buildProductOffers(product()) as Record<string, unknown>;

  assert.equal(offers["@type"], "Offer");
  assert.equal(offers.priceCurrency, "USD");
  assert.equal(offers.price, "5.00");
  assert.equal(offers.availability, "https://schema.org/InStock");
  assert.equal(offers.itemCondition, "https://schema.org/NewCondition");
  assert.equal((offers.seller as Record<string, string>)["@id"], organizationId);
});

test("multi-variant products produce multiple Offers with public variant SKUs", () => {
  const offers = buildProductOffers(product({
    variations: [
      { name: "25 Seeds", sku: "BNC-25", price: 5, inventory: 2 },
      { name: "100 Seeds", sku: "BNC-100", price: 12, inventory: 0 }
    ]
  })) as Array<Record<string, unknown>>;

  assert.equal(offers.length, 2);
  assert.equal(offers[0].price, "5.00");
  assert.equal(offers[0].sku, "BNC-25");
  assert.equal(offers[1].price, "12.00");
  assert.equal(offers[1].availability, "https://schema.org/OutOfStock");
});

test("sold-out and preorder availability are mapped without guessing", () => {
  const soldOut = buildProductOffers(product({ inventory: 0 })) as Record<string, unknown>;
  const preorder = buildProductOffers(product({
    name: "American Persimmon Bare Root Pre-Order",
    inventory: 20
  })) as Record<string, unknown>;
  const unknown = buildProductOffers(product({ inventory: Number.NaN })) as Record<string, unknown>;

  assert.equal(soldOut.availability, "https://schema.org/OutOfStock");
  assert.equal(preorder.availability, "https://schema.org/PreOrder");
  assert.equal(unknown.availability, undefined);
});

test("additional properties include useful public growing facts and omit blanks", () => {
  const entity = buildProductEntity(product({ sunlight: "", showSoil: false })) as Record<string, unknown>;
  const properties = entity.additionalProperty as Array<Record<string, string>>;
  const names = properties.map((property) => property.name);

  assert.ok(names.includes("Scientific name"));
  assert.ok(names.includes("Common name"));
  assert.ok(names.includes("Hardiness"));
  assert.ok(!names.includes("Sun"));
  assert.ok(!names.includes("Soil"));
});

test("inactive products do not produce product schema", () => {
  assert.equal(buildProductEntity(product({ active: false })), null);
  assert.equal(buildProductPageStructuredData(product({ active: false })), null);
});

test("breadcrumb schema uses correct positions and canonical URLs", () => {
  const breadcrumb = buildBreadcrumbList([
    { name: "Home", path: "/" },
    { name: "Shop", path: "/shop" },
    { name: "Test Product", path: "/shop/product/test-product" }
  ]) as Record<string, unknown>;
  const items = breadcrumb.itemListElement as Array<Record<string, unknown>>;

  assert.equal(breadcrumb["@type"], "BreadcrumbList");
  assert.equal(items[0].position, 1);
  assert.equal(items[0].item, "https://basecampnorthpa.com/");
  assert.equal(items[2].position, 3);
  assert.equal(items[2].item, "https://basecampnorthpa.com/shop/product/test-product");
});

test("serialized product schema contains no undefined values or internal database IDs", () => {
  const serialized = serializeJsonLd(buildProductPageStructuredData(product()));

  assert.doesNotMatch(serialized, /undefined/);
  assert.doesNotMatch(serialized, /prod_internal/);
  JSON.parse(serialized);
});
