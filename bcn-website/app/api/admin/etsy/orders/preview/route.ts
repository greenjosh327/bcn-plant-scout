import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/admin-api";
import {
  EtsyTransactionPreviewError,
  getEtsyTransactionPreview
} from "@/lib/etsy/order-preview";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();
    const admin = await requireAdmin(request, supabase);
    if ("error" in admin) return jsonError(admin.error || "Admin authorization failed.", admin.status);

    const listingId = Number(new URL(request.url).searchParams.get("listingId"));
    const preview = await getEtsyTransactionPreview(supabase, listingId);
    return NextResponse.json(preview, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof EtsyTransactionPreviewError ? error.status : 500;
    console.error("Etsy transaction preview failed", {
      endpoint: "/api/admin/etsy/orders/preview",
      status
    });
    return jsonError(
      error instanceof EtsyTransactionPreviewError
        ? error.message
        : "Recent Etsy transactions could not be previewed.",
      status
    );
  }
}
