import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/admin-api";
import { applyEtsyInventoryProposal } from "@/lib/etsy/inventory-apply";
import { etsyInventoryWritesEnabled } from "@/lib/etsy/config";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ proposalId: string }> }
) {
  try {
    const supabase = getSupabaseServiceClient();
    const admin = await requireAdmin(request, supabase);
    if ("error" in admin) {
      return jsonError(typeof admin.error === "string" ? admin.error : "Admin authorization failed.", admin.status);
    }
    if (!etsyInventoryWritesEnabled()) {
      return jsonError("Etsy inventory writes are locked pending owner review of the first generated proposal.", 423);
    }

    const { proposalId } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(proposalId)) return jsonError("A valid proposal ID is required.");
    const body = (await request.json()) as { confirmation?: unknown };
    const result = await applyEtsyInventoryProposal(
      supabase,
      admin.user.id,
      proposalId,
      typeof body.confirmation === "string" ? body.confirmation : ""
    );
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Etsy inventory proposal could not be applied:", error instanceof Error ? error.message : "Unknown error");
    return jsonError(error instanceof Error ? error.message : "The Etsy inventory proposal could not be applied.", 409);
  }
}
