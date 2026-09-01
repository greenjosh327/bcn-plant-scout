import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/admin-api";
import { confirmSuggestedEtsyMapping } from "@/lib/etsy/inventory-proposals";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();
    const admin = await requireAdmin(request, supabase);
    if ("error" in admin) {
      return jsonError(typeof admin.error === "string" ? admin.error : "Admin authorization failed.", admin.status);
    }

    const body = (await request.json()) as { listingId?: unknown };
    const listingId = Number(body.listingId);
    if (!Number.isSafeInteger(listingId) || listingId <= 0) return jsonError("A valid Etsy listing ID is required.");

    const mapping = await confirmSuggestedEtsyMapping(supabase, admin.user.id, listingId);
    return NextResponse.json({ mapping }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Etsy inventory mapping could not be confirmed:", error instanceof Error ? error.message : "Unknown error");
    return jsonError(error instanceof Error ? error.message : "The Etsy inventory mapping could not be confirmed.", 409);
  }
}
