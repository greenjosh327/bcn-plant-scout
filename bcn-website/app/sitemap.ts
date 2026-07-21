import type { MetadataRoute } from "next";
import { getCatalogProducts } from "@/lib/catalog-db";
import { buildCanonicalUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

type SitemapEntry = MetadataRoute.Sitemap[number];

const staticEntries: SitemapEntry[] = [
  {
    url: buildCanonicalUrl("/"),
    changeFrequency: "weekly",
    priority: 1
  },
  {
    url: buildCanonicalUrl("/shop"),
    changeFrequency: "daily",
    priority: 0.9
  },
  {
    url: buildCanonicalUrl("/gis"),
    changeFrequency: "monthly",
    priority: 0.7
  },
  {
    url: buildCanonicalUrl("/about"),
    changeFrequency: "monthly",
    priority: 0.6
  },
  {
    url: buildCanonicalUrl("/contact"),
    changeFrequency: "monthly",
    priority: 0.6
  }
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const productEntries = await getProductEntries();

  return uniqueEntries([...staticEntries, ...productEntries]);
}

async function getProductEntries(): Promise<SitemapEntry[]> {
  try {
    const products = await getCatalogProducts();

    return products
      .filter((product) => product.active)
      .map((product) => ({
        url: buildCanonicalUrl(`/shop/product/${product.slug}`),
        lastModified: validDateOrUndefined(product.updatedAt),
        changeFrequency: "daily" as const,
        priority: 0.8
      }));
  } catch (error) {
    console.error("Could not build product sitemap entries.", error);
    return [];
  }
}

function validDateOrUndefined(value: string) {
  if (!value) return undefined;
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

function uniqueEntries(entries: SitemapEntry[]) {
  return Array.from(new Map(entries.map((entry) => [entry.url, entry])).values());
}
