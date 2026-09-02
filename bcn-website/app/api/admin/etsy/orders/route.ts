import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/admin-api";
import { getEtsyOrderSyncStatus } from "@/lib/etsy/order-sync";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();
    const admin = await requireAdmin(request, supabase);
    if ("error" in admin) return jsonError(admin.error || "Admin authorization failed.", admin.status);
    const status = await getEtsyOrderSyncStatus(supabase);
    return NextResponse.json(status, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Etsy order-sync status failed", { message: error instanceof Error ? error.message : "Unknown error" });
    return jsonError(error instanceof Error ? error.message : "Etsy order-sync status could not be loaded.", 500);
  }
}
