import { buildGoogleMerchantFeed } from "@/lib/marketing/google-merchant-feed";
import { getCatalogProducts } from "@/lib/catalog-db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const products = await getCatalogProducts();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const feed = buildGoogleMerchantFeed(products, siteUrl);

  return new Response(feed, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=900, s-maxage=3600"
    }
  });
}
