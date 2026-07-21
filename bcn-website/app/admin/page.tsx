import type { Metadata } from "next";
import { AdminCatalogEditor } from "@/components/admin-catalog-editor";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
};

export default function AdminPage() {
  return <AdminCatalogEditor />;
}
