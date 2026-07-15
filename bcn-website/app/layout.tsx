import type { Metadata } from "next";
import { Suspense } from "react";
import Script from "next/script";
import "./globals.css";
import { Footer } from "@/components/footer";
import { ShopAnalyticsPageView } from "@/components/shop-analytics-page-view";
import { SiteHeader } from "@/components/site-header";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://shop.basecampnorthpa.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Base Camp North | Native Plants and GIS Services",
  description:
    "Base Camp North is a Pennsylvania nursery focused on native trees, seed collection, pollinator plants, and practical GIS services.",
  icons: {
    icon: [{ url: "/bcn-icon.png", sizes: "1024x1024", type: "image/png" }],
    apple: [{ url: "/bcn-icon.png", sizes: "1024x1024", type: "image/png" }]
  },
  openGraph: {
    title: "Base Camp North | Native Plants and GIS Services",
    description:
      "Native trees, seed collection, pollinator plants, and GIS-backed field work from Base Camp North.",
    images: [
      {
        url: "/images/bcn-logo.png",
        width: 1536,
        height: 561,
        alt: "Base Camp North logo"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Base Camp North | Native Plants and GIS Services",
    description:
      "Native trees, seed collection, pollinator plants, and GIS-backed field work from Base Camp North.",
    images: ["/images/bcn-logo.png"]
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const googleTagId = process.env.NEXT_PUBLIC_GOOGLE_TAG_ID || "G-KHYPDHB4W4";
  const googleAdsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const googleConfigIds = Array.from(new Set([googleTagId, googleAdsId].filter(Boolean)));

  return (
    <html lang="en">
      <body>
        {googleTagId ? (
          <>
            <Script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleTagId)}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){window.dataLayer.push(arguments);}
                gtag('js', new Date());
                ${googleConfigIds.map((id) => `gtag('config', ${JSON.stringify(id)});`).join("\n")}
              `}
            </Script>
          </>
        ) : null}
        <Suspense fallback={null}>
          <ShopAnalyticsPageView />
        </Suspense>
        <SiteHeader />
        {children}
        <Footer />
      </body>
    </html>
  );
}
