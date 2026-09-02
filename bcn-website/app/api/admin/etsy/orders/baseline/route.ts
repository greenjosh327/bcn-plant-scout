import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/admin-api";
import { initializeEtsyOrderSyncBaseline } from "@/lib/etsy/order-sync";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();
    const admin = await requireAdmin(request, supabase);
    if ("error" in admin) return jsonError(admin.error || "Admin authorization failed.", admin.status);

    const body = await request.json().catch(() => ({})) as { confirmation?: string };
    if (body.confirmation !== "START ETSY ORDER SYNC") {
      return jsonError("Type START ETSY ORDER SYNC to initialize the current-time baseline.");
    }

    const baseline = await initializeEtsyOrderSyncBaseline(supabase, admin.user.id);
    return NextResponse.json({ baseline }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Etsy order-sync baseline initialization failed", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return jsonError(error instanceof Error ? error.message : "The Etsy order-sync baseline could not be initialized.", 400);
  }
}
