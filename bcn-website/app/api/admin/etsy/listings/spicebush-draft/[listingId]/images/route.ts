import { NextResponse } from "next/server";
import { SpicebushDraftError, uploadSpicebushImage } from "@/lib/etsy/spicebush-draft";
import {
  authorizeSpicebushOperation,
  recordSpicebushFailure,
  recordSpicebushImage
} from "@/lib/etsy/spicebush-operation";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ listingId: string }> }) {
  const supabase = getSupabaseServiceClient();
  let authorization: Awaited<ReturnType<typeof authorizeSpicebushOperation>> | null = null;
  try {
    authorization = await authorizeSpicebushOperation(request, supabase);
    const listingId = Number((await params).listingId);
    if (!Number.isSafeInteger(listingId) || listingId <= 0 || Number(authorization.operation.listing_id) !== listingId) {
      throw new SpicebushDraftError("The one-time operation does not own this Spicebush draft.", 403);
    }
    const form = await request.formData();
    const rank = Number(form.get("rank"));
    const image = form.get("image");
    const altText = typeof form.get("altText") === "string" ? String(form.get("altText")).trim() : "";
    if (!(image instanceof Blob) || !altText) throw new SpicebushDraftError("A JPEG and alt text are required.");
    const result = await uploadSpicebushImage(supabase, {
      listingId,
      rank,
      image,
      fileName: image instanceof File && image.name ? image.name : `spicebush-${rank}.jpg`,
      altText
    });
    await recordSpicebushImage(supabase, authorization, listingId, rank);
    return NextResponse.json(result, {
      status: result.uploaded ? 201 : 200,
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    await recordSpicebushFailure(supabase, authorization, error);
    const status = error instanceof SpicebushDraftError ? error.status : 500;
    console.error("Spicebush Etsy image upload failed", {
      endpoint: "/api/admin/etsy/listings/spicebush-draft/:listingId/images",
      status,
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return NextResponse.json({ error: error instanceof Error ? error.message : "The image upload failed." }, {
      status,
      headers: { "cache-control": "no-store" }
    });
  }
}
