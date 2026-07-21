import type { Metadata } from "next";
import { Suspense } from "react";
import Script from "next/script";
import "./globals.css";
import { Footer } from "@/components/footer";
import { ShopAnalyticsPageView } from "@/components/shop-analytics-page-view";
import { SiteHeader } from "@/components/site-header";
import { buildRootMetadata } from "@/lib/seo";

export const metadata: Metadata = buildRootMetadata();

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
