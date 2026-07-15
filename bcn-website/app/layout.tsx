import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Footer } from "@/components/footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Base Camp North | Native Plants and GIS Services",
  description:
    "Base Camp North is a Pennsylvania nursery focused on native trees, seed collection, pollinator plants, and practical GIS services."
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
        <SiteHeader />
        {children}
        <Footer />
      </body>
    </html>
  );
}
