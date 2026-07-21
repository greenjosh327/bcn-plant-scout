import { contactEmails } from "./contact";
import { getProductImages } from "./product-images";
import {
  buildAbsoluteImageUrl,
  buildCanonicalUrl,
  buildProductMetaDescription,
  cleanMetaDescription,
  cleanMetaTitle,
  siteConfig
} from "./seo";
import type { Product, ProductVariation } from "./types";

export type JsonLdPrimitive = string | number | boolean | null;
export type JsonLdInput = JsonLdPrimitive | JsonLdInput[] | { [key: string]: JsonLdInput } | undefined;
export type JsonLdValue = Exclude<JsonLdInput, undefined>;

export const organizationId = `${siteConfig.url}/#organization`;
export const websiteId = `${siteConfig.url}/#website`;

const SCHEMA_CONTEXT = "https://schema.org";
const NEW_CONDITION = "https://schema.org/NewCondition";
const IN_STOCK = "https://schema.org/InStock";
const OUT_OF_STOCK = "https://schema.org/OutOfStock";
const PRE_ORDER = "https://schema.org/PreOrder";
const USD = "USD";

const PLACEHOLDER_VALUES = new Set([
  "See description",
  "See product description",
  "See product description for bloom and pollinator notes.",
  "Selected for nursery, wildlife, food forest, or restoration value.",
  "Shipping and pickup availability depends on item size, season, and live-plant condition."
]);

type BreadcrumbItem = {
  name: string;
  path: string;
};

export function serializeJsonLd(data: JsonLdInput) {
  const compacted = compactJsonLd(data);

  return JSON.stringify(compacted)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function buildStructuredDataGraph(items: JsonLdInput[]) {
  return compactJsonLd({
    "@context": SCHEMA_CONTEXT,
    "@graph": items
  });
}

export function buildHomepageStructuredData() {
  return buildStructuredDataGraph([
    buildBusinessEntity(),
    buildWebsiteEntity()
  ]);
}

export function buildBusinessEntity() {
  const logo = buildAbsoluteImageUrl(siteConfig.defaultSocialImage.url);

  return compactJsonLd({
    "@type": ["Organization", "GardenStore"],
    "@id": organizationId,
    name: siteConfig.name,
    url: siteConfig.url,
    logo,
    image: logo,
    description: siteConfig.defaultDescription,
    email: contactEmails.general,
    areaServed: {
      "@type": "State",
      name: "Pennsylvania"
    },
    contactPoint: buildContactPoints()
  });
}

export function buildWebsiteEntity() {
  return compactJsonLd({
    "@type": "WebSite",
    "@id": websiteId,
    url: siteConfig.url,
    name: siteConfig.name,
    description: siteConfig.defaultDescription,
    publisher: {
      "@id": organizationId
    }
  });
}

export function buildContactPoints() {
  return [
    buildContactPoint("customer service", contactEmails.general),
    buildContactPoint("sales", contactEmails.sales),
    buildContactPoint("order support", contactEmails.orders),
    buildContactPoint("technical support", contactEmails.support)
  ];
}

export function buildBreadcrumbList(items: BreadcrumbItem[]) {
  const listItems = items
    .map((item, index) => {
      const name = cleanStructuredText(item.name, 80);
      const itemUrl = buildCanonicalUrl(item.path);
      if (!name || !itemUrl) return null;

      return {
        "@type": "ListItem",
        position: index + 1,
        name,
        item: itemUrl
      };
    })
    .filter(Boolean);

  if (listItems.length < 2) return null;

  return compactJsonLd({
    "@context": SCHEMA_CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: listItems
  });
}

export function buildProductPageStructuredData(product: Product) {
  if (!product.active || !product.slug) return null;

  return buildStructuredDataGraph([
    buildProductEntity(product),
    buildProductBreadcrumbList(product)
  ]);
}

export function buildProductBreadcrumbList(product: Pick<Product, "name" | "slug">) {
  return buildBreadcrumbList([
    { name: "Home", path: "/" },
    { name: "Shop", path: "/shop" },
    { name: product.name, path: `/shop/product/${product.slug}` }
  ]);
}

export function buildProductEntity(product: Product) {
  if (!product.active || !product.slug) return null;

  const canonical = buildCanonicalUrl(`/shop/product/${product.slug}`);
  const productImages = getSchemaProductImages(product);
  const offers = buildProductOffers(product);
  const additionalProperty = buildProductAdditionalProperties(product);

  return compactJsonLd({
    "@type": "Product",
    "@id": `${canonical}#product`,
    name: cleanMetaTitle(product.name, 120),
    description: buildProductMetaDescription(product),
    url: canonical,
    image: productImages.length > 0 ? productImages : undefined,
    sku: getProductSku(product),
    category: product.category,
    brand: {
      "@type": "Brand",
      name: siteConfig.name
    },
    offers,
    additionalProperty: additionalProperty.length > 0 ? additionalProperty : undefined
  });
}

export function buildProductOffers(product: Product) {
  const variants = product.variations?.filter((variant) => isValidPrice(variant.price)) ?? [];

  if (variants.length > 0) {
    const offers = variants.map((variant) => buildOffer(product, variant)).filter(Boolean);
    if (offers.length === 0) return undefined;
    return offers.length === 1 ? offers[0] : offers;
  }

  if (!isValidPrice(product.price)) return undefined;
  return buildOffer(product);
}

function buildOffer(product: Product, variation?: ProductVariation) {
  const price = variation?.price ?? product.price;
  if (!isValidPrice(price)) return null;

  const inventory = variation ? variation.inventory : product.inventory;
  const preorder = isPreorder(product, variation);

  return compactJsonLd({
    "@type": "Offer",
    url: buildCanonicalUrl(`/shop/product/${product.slug}`),
    name: variation ? cleanStructuredText(variation.name, 120) : undefined,
    sku: cleanStructuredText(variation?.sku, 80),
    priceCurrency: USD,
    price: formatSchemaPrice(price),
    availability: getSchemaAvailability(inventory, preorder),
    itemCondition: NEW_CONDITION,
    seller: {
      "@id": organizationId
    }
  });
}

function buildProductAdditionalProperties(product: Product) {
  const properties = [
    buildPropertyValue("Scientific name", product.scientificName),
    buildPropertyValue("Common name", product.commonName),
    buildPropertyValue("Plant type", product.plantType),
    product.showHardinessZones === false ? null : buildPropertyValue("Hardiness", product.hardinessZones),
    product.showSunlight === false ? null : buildPropertyValue("Sun", product.sunlight),
    product.showSoil === false ? null : buildPropertyValue("Soil", product.soil),
    product.showBloomTime === false ? null : buildPropertyValue("Bloom or harvest season", product.bloomTime),
    product.showHeight === false ? null : buildPropertyValue("Mature height", product.height),
    product.showSpread === false ? null : buildPropertyValue("Spacing", product.spread),
    product.showNativeStatus === false ? null : buildPropertyValue("Native range", product.nativeStatus),
    product.showWildlifeBenefits === false ? null : buildPropertyValue("Wildlife value", product.wildlifeBenefits),
    product.showPollinatorBenefits === false ? null : buildPropertyValue("Pollinator value", product.pollinatorBenefits),
    product.showHostSpecies === false ? null : buildPropertyValue("Host plant information", product.hostSpecies)
  ];

  return properties.filter(Boolean);
}

function buildPropertyValue(name: string, value: string | undefined) {
  const cleanValue = cleanStructuredText(value, 160);
  if (!cleanValue || PLACEHOLDER_VALUES.has(cleanValue)) return null;

  return {
    "@type": "PropertyValue",
    name,
    value: cleanValue
  };
}

function buildContactPoint(contactType: string, email: string) {
  return {
    "@type": "ContactPoint",
    contactType,
    email,
    areaServed: "US"
  };
}

function getSchemaProductImages(product: Product) {
  return getProductImages(product)
    .filter((image) => !image.isFallback)
    .map((image) => buildAbsoluteImageUrl(image.url))
    .filter(Boolean);
}

function getProductSku(product: Product) {
  const variants = product.variations ?? [];
  if (variants.length !== 1) return undefined;
  return cleanStructuredText(variants[0].sku, 80);
}

function isValidPrice(value: number) {
  return Number.isFinite(value) && value > 0;
}

function formatSchemaPrice(value: number) {
  return value.toFixed(2);
}

function getSchemaAvailability(inventory: number, preorder: boolean) {
  if (preorder) return PRE_ORDER;
  if (!Number.isFinite(inventory)) return undefined;
  return inventory > 0 ? IN_STOCK : OUT_OF_STOCK;
}

function isPreorder(product: Product, variation?: ProductVariation) {
  return /pre[-\s]?order/i.test(`${product.name} ${product.description} ${variation?.name ?? ""}`);
}

function cleanStructuredText(value: string | null | undefined, maxLength = 200) {
  const text = cleanMetaDescription(value, maxLength);
  if (!text || PLACEHOLDER_VALUES.has(text)) return "";
  return text.replace(/[.]+$/g, "");
}

function compactJsonLd(value: JsonLdInput): JsonLdInput {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value.trim() ? value : undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    const compacted = value
      .map((item) => compactJsonLd(item))
      .filter((item): item is JsonLdValue => item !== undefined);
    return compacted.length > 0 ? compacted : undefined;
  }

  const entries = Object.entries(value)
    .map(([key, item]) => [key, compactJsonLd(item)] as const)
    .filter(([, item]) => item !== undefined);

  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries) as JsonLdValue;
}
