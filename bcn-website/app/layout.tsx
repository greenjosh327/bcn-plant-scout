import type { Metadata } from "next";
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
        <SiteHeader />
        {children}
        <Footer />
      </body>
    </html>
  );
}
