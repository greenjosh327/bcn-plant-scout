import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/admin-api";
import {
  createSeedProductDrafts,
  preflightSeedProductDrafts,
  SEED_PRODUCT_DRAFT_CONFIRMATION,
  SeedProductDraftError
} from "@/lib/etsy/seed-product-drafts";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function errorResponse(error: unknown) {
  const status = error instanceof SeedProductDraftError ? error.status : 500;
  console.error("Approved seed product Etsy draft workflow failed", {
    endpoint: "/api/admin/etsy/listings/seed-product-drafts",
    status,
    message: error instanceof Error ? error.message : "Unknown error"
  });
  return NextResponse.json({
    error: error instanceof Error ? error.message : "The seed product draft workflow failed.",
    listingId: error instanceof SeedProductDraftError ? error.listingId : null
  }, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();
    const admin = await requireAdmin(request, supabase);
    if ("error" in admin) {
      return jsonError(typeof admin.error === "string" ? admin.error : "Admin authorization failed.", admin.status);
    }
    return NextResponse.json(await preflightSeedProductDrafts(supabase), {
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();
    const admin = await requireAdmin(request, supabase);
    if ("error" in admin) {
      return jsonError(typeof admin.error === "string" ? admin.error : "Admin authorization failed.", admin.status);
    }
    const body = (await request.json()) as { confirmation?: unknown; fingerprint?: unknown };
    if (body.confirmation !== SEED_PRODUCT_DRAFT_CONFIRMATION) {
      throw new SeedProductDraftError(`Use ${SEED_PRODUCT_DRAFT_CONFIRMATION} to confirm draft-only creation.`);
    }
    if (typeof body.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(body.fingerprint)) {
      throw new SeedProductDraftError("Run the verified preflight before creating either draft.");
    }
    const result = await createSeedProductDrafts(supabase, body.fingerprint);
    return NextResponse.json(result, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
