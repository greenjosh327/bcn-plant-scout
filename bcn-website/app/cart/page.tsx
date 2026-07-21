import type { Metadata } from "next";
import { CartClient } from "@/components/cart-client";
import { getCatalogProducts } from "@/lib/catalog-db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
};

export default async function CartPage() {
  const products = await getCatalogProducts();

  return (
    <main className="container py-12">
      <CartClient products={products} />
    </main>
  );
}
