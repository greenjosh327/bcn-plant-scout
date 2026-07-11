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
  return (
    <html lang="en">
      <body>
        <Script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-KHYPDHB4W4"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-KHYPDHB4W4');
          `}
        </Script>
        <SiteHeader />
        {children}
        <Footer />
      </body>
    </html>
  );
}
