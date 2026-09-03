import { NextResponse } from "next/server";
import { jsonError } from "@/lib/admin-api";
import { MuscadineDraftError, uploadMuscadineDraftImage } from "@/lib/etsy/muscadine-draft";
import { authorizeMuscadineRequest, recordMuscadineImageUploaded } from "@/lib/etsy/muscadine-operation";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> }
) {
  try {
    const supabase = getSupabaseServiceClient();
    const authorization = await authorizeMuscadineRequest(request, supabase);

    const { listingId: listingIdParam } = await params;
    const listingId = Number(listingIdParam);
    if (authorization.mode === "operation" && Number(authorization.operation.listing_id) !== listingId) {
      return jsonError("The one-time operation does not own this Etsy draft.", 403);
    }
    const form = await request.formData();
    const rank = Number(form.get("rank"));
    const image = form.get("image");
    if (!(image instanceof Blob)) return jsonError("A JPEG image is required.");

    const result = await uploadMuscadineDraftImage(supabase, {
      listingId,
      rank,
      image,
      fileName: image instanceof File && image.name ? image.name : `muscadine-${rank}.jpg`
    });
    await recordMuscadineImageUploaded(supabase, authorization, listingId, rank);
    return NextResponse.json(result, { status: result.uploaded ? 201 : 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof MuscadineDraftError ? error.status : 500;
    console.error("Muscadine Etsy draft image upload failed", {
      endpoint: "/api/admin/etsy/listings/muscadine-draft/:listingId/images",
      status,
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return jsonError(error instanceof Error ? error.message : "The Etsy image upload failed.", status);
  }
}
