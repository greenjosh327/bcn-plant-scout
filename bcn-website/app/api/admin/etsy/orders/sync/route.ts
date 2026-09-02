import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/admin-api";
import { syncEtsyOrders } from "@/lib/etsy/order-sync";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const runtime = "nodejs";
export const maxDuration = 300;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();
    const admin = await requireAdmin(request, supabase);
    if ("error" in admin) return jsonError(admin.error || "Admin authorization failed.", admin.status);

    const body = await request.json().catch(() => ({})) as { confirmation?: string; clientRequestId?: string };
    if (body.confirmation !== "SYNC ETSY ORDERS") {
      return jsonError("Type SYNC ETSY ORDERS to start this exact order-sync run.");
    }
    if (!body.clientRequestId || !UUID_PATTERN.test(body.clientRequestId)) {
      return jsonError("A valid order-sync request ID is required.");
    }

    const status = await syncEtsyOrders(supabase, admin.user.id, body.clientRequestId);
    return NextResponse.json(status, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Etsy order sync failed", { message: error instanceof Error ? error.message : "Unknown error" });
    return jsonError(error instanceof Error ? error.message : "Etsy orders could not be synchronized.", 502);
  }
}
