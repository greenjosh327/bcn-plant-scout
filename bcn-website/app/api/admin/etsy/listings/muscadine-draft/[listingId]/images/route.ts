import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/admin-api";
import { MuscadineDraftError, uploadMuscadineDraftImage } from "@/lib/etsy/muscadine-draft";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> }
) {
  try {
    const supabase = getSupabaseServiceClient();
    const admin = await requireAdmin(request, supabase);
    if ("error" in admin) return jsonError(admin.error || "Admin authorization failed.", admin.status);

    const { listingId: listingIdParam } = await params;
    const listingId = Number(listingIdParam);
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
