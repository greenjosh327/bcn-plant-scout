import type { Product } from "@/lib/types";

const FEED_SLUGS = [
  "honey-locust-seeds-fast-growing-tree-deer-food-wildlife-permaculture",
  "prairifire-crabapple-seeds"
];

export function getGoogleMerchantFeedProducts(products: Product[]) {
  return products
    .filter((product) => product.active && FEED_SLUGS.includes(product.slug))
    .sort((a, b) => FEED_SLUGS.indexOf(a.slug) - FEED_SLUGS.indexOf(b.slug));
}

export function buildGoogleMerchantFeed(products: Product[], siteUrl: string) {
  const normalizedSiteUrl = siteUrl.replace(/\/$/, "");
  const items = getGoogleMerchantFeedProducts(products).map((product) => buildFeedItem(product, normalizedSiteUrl));

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Base Camp North Shop</title>
    <link>${escapeXml(normalizedSiteUrl)}</link>
    <description>Base Camp North native seeds and nursery products.</description>
${items.join("\n")}
  </channel>
</rss>
`;
}

function buildFeedItem(product: Product, siteUrl: string) {
  const totalInventory = getTotalInventory(product);
  const availability = totalInventory > 0 ? "in_stock" : "out_of_stock";
  const productUrl = `${siteUrl}/shop/product/${product.slug}`;
  const imageUrl = absolutizeUrl(product.images[0], siteUrl);
  const description = cleanDescription(product.description || product.growingNotes || product.name);

  return `    <item>
      <g:id>${escapeXml(product.id)}</g:id>
      <g:title>${escapeXml(product.name)}</g:title>
      <g:description>${escapeXml(description)}</g:description>
      <g:link>${escapeXml(productUrl)}</g:link>
      <g:image_link>${escapeXml(imageUrl)}</g:image_link>
      <g:availability>${availability}</g:availability>
      <g:price>${formatFeedPrice(product.price)}</g:price>
      <g:condition>new</g:condition>
      <g:brand>Base Camp North</g:brand>
      <g:identifier_exists>no</g:identifier_exists>
      <g:product_type>Seeds</g:product_type>
      <g:shipping>
        <g:country>US</g:country>
        <g:service>Economy Seed Mail</g:service>
        <g:price>2.00 USD</g:price>
      </g:shipping>
    </item>`;
}

function getTotalInventory(product: Product) {
  const variationInventory = product.variations?.reduce((sum, variation) => sum + Math.max(variation.inventory, 0), 0) ?? 0;
  return Math.max(product.inventory, variationInventory);
}

function formatFeedPrice(value: number) {
  return `${(Number(value) || 0).toFixed(2)} USD`;
}

function absolutizeUrl(value: string | undefined, siteUrl: string) {
  if (!value) return `${siteUrl}/images/scout-seedling-tray.webp`;
  if (/^https?:\/\//i.test(value)) return value;
  return `${siteUrl}${value.startsWith("/") ? value : `/${value}`}`;
}

function cleanDescription(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000);
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
