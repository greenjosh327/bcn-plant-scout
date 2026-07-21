import type { MetadataRoute } from "next";
import { buildCanonicalUrl, siteConfig } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/shop/admin",
          "/api",
          "/cart",
          "/auth",
          "/account",
          "/login",
          "/preview",
          "/drafts",
          "/test",
          "/dev"
        ]
      }
    ],
    sitemap: buildCanonicalUrl("/sitemap.xml"),
    host: siteConfig.url
  };
}
