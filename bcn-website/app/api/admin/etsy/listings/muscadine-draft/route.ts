import { NextResponse } from "next/server";
import { jsonError } from "@/lib/admin-api";
import {
  createMuscadineDraft,
  MUSCADINE_DRAFT_CONFIRMATION,
  MuscadineDraftError,
  preflightMuscadineDraft,
  readMuscadineDraft
} from "@/lib/etsy/muscadine-draft";
import {
  authorizeMuscadineRequest,
  claimMuscadineOperation,
  completeMuscadineOperation,
  recordMuscadineDraftCreated,
  recordMuscadineOperationFailure,
  type MuscadineRequestAuthorization
} from "@/lib/etsy/muscadine-operation";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function handleError(error: unknown) {
  const status = error instanceof MuscadineDraftError ? error.status : 500;
  console.error("Muscadine Etsy draft workflow failed", {
    endpoint: "/api/admin/etsy/listings/muscadine-draft",
    status,
    message: error instanceof Error ? error.message : "Unknown error"
  });
  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : "The Muscadine draft workflow failed.",
      listingId: error instanceof MuscadineDraftError ? error.listingId : null
    },
    { status, headers: { "cache-control": "no-store" } }
  );
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();
    const authorization = await authorizeMuscadineRequest(request, supabase);

    const listingIdParam = new URL(request.url).searchParams.get("listingId");
    if (listingIdParam) {
      const listingId = Number(listingIdParam);
      if (!Number.isSafeInteger(listingId) || listingId <= 0) return jsonError("A valid listing ID is required.");
      if (authorization.mode === "operation" && Number(authorization.operation.listing_id) !== listingId) {
        return jsonError("The one-time operation does not own this Etsy draft.", 403);
      }
      const readback = await readMuscadineDraft(supabase, listingId);
      if (
        authorization.mode === "operation" &&
        readback.state === "draft" &&
        readback.imageCount === 3 &&
        readback.variations.length === 2 &&
        readback.variations.every((variation) => variation.quantity === 0 && !variation.isEnabled)
      ) {
        await completeMuscadineOperation(supabase, authorization, listingId);
      }
      return NextResponse.json(readback, { headers: { "cache-control": "no-store" } });
    }

    const preflight = await preflightMuscadineDraft(supabase);
    return NextResponse.json(preflight, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();
  let authorization: MuscadineRequestAuthorization | null = null;
  try {
    authorization = await authorizeMuscadineRequest(request, supabase);

    const body = (await request.json()) as { confirmation?: unknown; fingerprint?: unknown };
    if (body.confirmation !== MUSCADINE_DRAFT_CONFIRMATION) {
      return jsonError(`Type ${MUSCADINE_DRAFT_CONFIRMATION} to confirm this draft-only creation.`);
    }
    if (typeof body.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(body.fingerprint)) {
      return jsonError("Run the Etsy preflight before creating the draft.");
    }

    const operation = await claimMuscadineOperation(supabase, authorization);
    if (operation?.listing_id) {
      return NextResponse.json(
        { listingId: Number(operation.listing_id), state: "draft", resumed: true },
        { status: 200, headers: { "cache-control": "no-store" } }
      );
    }
    const created = await createMuscadineDraft(supabase, body.fingerprint);
    await recordMuscadineDraftCreated(supabase, authorization, created.listingId);
    return NextResponse.json(created, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (authorization) await recordMuscadineOperationFailure(supabase, authorization, error);
    return handleError(error);
  }
}
