import type { Metadata } from "next";
import { AdminCatalogEditor } from "@/components/admin-catalog-editor";

export const metadata: Metadata = {
  title: "Etsy | BCN Admin",
  robots: { index: false, follow: false }
};

export default function EtsyAdminPage() {
  return <AdminCatalogEditor initialTab="etsy" />;
}
