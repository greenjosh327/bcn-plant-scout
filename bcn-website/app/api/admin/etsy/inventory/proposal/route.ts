import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/admin-api";
import { generateEtsyInventoryProposal } from "@/lib/etsy/inventory-proposals";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();
    const admin = await requireAdmin(request, supabase);
    if ("error" in admin) {
      return jsonError(typeof admin.error === "string" ? admin.error : "Admin authorization failed.", admin.status);
    }

    const proposal = await generateEtsyInventoryProposal(supabase, admin.user.id);
    return NextResponse.json(proposal, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Etsy inventory proposal could not be generated:", error instanceof Error ? error.message : "Unknown error");
    return jsonError(
      error instanceof Error ? error.message : "The Etsy inventory proposal could not be generated.",
      502
    );
  }
}
