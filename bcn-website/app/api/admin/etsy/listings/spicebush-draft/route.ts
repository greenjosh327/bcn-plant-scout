import { NextResponse } from "next/server";
import {
  createSpicebushDraft,
  preflightSpicebushDraft,
  readSpicebushDraft,
  SPICEBUSH_DRAFT_CONFIRMATION,
  SpicebushDraftError
} from "@/lib/etsy/spicebush-draft";
import {
  authorizeSpicebushOperation,
  claimSpicebushOperation,
  completeSpicebushOperation,
  recordSpicebushCreated,
  recordSpicebushFailure
} from "@/lib/etsy/spicebush-operation";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function errorResponse(error: unknown) {
  const status = error instanceof SpicebushDraftError ? error.status : 500;
  console.error("Spicebush Etsy draft workflow failed", {
    endpoint: "/api/admin/etsy/listings/spicebush-draft",
    status,
    message: error instanceof Error ? error.message : "Unknown error"
  });
  return NextResponse.json({
    error: error instanceof Error ? error.message : "The Spicebush draft workflow failed.",
    listingId: error instanceof SpicebushDraftError ? error.listingId : null
  }, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();
    const authorization = await authorizeSpicebushOperation(request, supabase);
    const listingIdParam = new URL(request.url).searchParams.get("listingId");
    if (!listingIdParam) {
      return NextResponse.json(await preflightSpicebushDraft(supabase), {
        headers: { "cache-control": "no-store" }
      });
    }
    const listingId = Number(listingIdParam);
    if (!Number.isSafeInteger(listingId) || listingId <= 0) {
      throw new SpicebushDraftError("A valid listing ID is required.");
    }
    if (Number(authorization.operation.listing_id) !== listingId) {
      throw new SpicebushDraftError("The one-time operation does not own this Spicebush draft.", 403);
    }
    const readback = await readSpicebushDraft(supabase, listingId);
    if (readback.state === "draft" && readback.imageCount === 4 && readback.warnings.every((warning) => !warning.includes("mismatch"))) {
      await completeSpicebushOperation(supabase, authorization, listingId);
    }
    return NextResponse.json(readback, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();
  let authorization: Awaited<ReturnType<typeof authorizeSpicebushOperation>> | null = null;
  try {
    authorization = await authorizeSpicebushOperation(request, supabase);
    const body = (await request.json()) as { confirmation?: unknown; fingerprint?: unknown };
    if (body.confirmation !== SPICEBUSH_DRAFT_CONFIRMATION) {
      throw new SpicebushDraftError(`Type ${SPICEBUSH_DRAFT_CONFIRMATION} to confirm draft-only creation.`);
    }
    if (typeof body.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(body.fingerprint)) {
      throw new SpicebushDraftError("Run the verified preflight before creating the draft.");
    }
    await claimSpicebushOperation(supabase, authorization);
    const created = await createSpicebushDraft(supabase, body.fingerprint);
    await recordSpicebushCreated(supabase, authorization, created.listingId);
    return NextResponse.json(created, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    await recordSpicebushFailure(supabase, authorization, error);
    return errorResponse(error);
  }
}
