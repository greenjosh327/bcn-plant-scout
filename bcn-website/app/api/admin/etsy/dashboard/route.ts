import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/admin-api";
import { getEtsyDashboard } from "@/lib/etsy/client";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();
    const admin = await requireAdmin(request, supabase);
    if ("error" in admin) {
      const message = typeof admin.error === "string" ? admin.error : "Admin authorization failed.";
      return jsonError(message, admin.status);
    }

    const dashboard = await getEtsyDashboard(supabase);
    return NextResponse.json(dashboard, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Etsy dashboard could not load:", error instanceof Error ? error.message : "Unknown error");
    return jsonError("Etsy data could not be loaded. Check the connection and try again.", 502);
  }
}
