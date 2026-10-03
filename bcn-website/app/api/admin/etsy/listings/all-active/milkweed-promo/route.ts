import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";
import {
  applyAllActiveMilkweedPromo,
  auditAllActiveMilkweedPromo,
  BulkPromoError
} from "@/lib/etsy/one-time-all-active-milkweed-promo";

export const runtime = "nodejs";
export const maxDuration = 300;

const TOKEN_HASH = "5cf2be35e3a50ab34a4e44d0dda69ae683f2170df6dd0013c0808adbb78715f7";

function validToken(token: string) {
  const actual = Buffer.from(createHash("sha256").update(token, "utf8").digest("hex"), "utf8");
  const expected = Buffer.from(TOKEN_HASH, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const token = String(form.get("token") || "");
    const mode = String(form.get("mode") || "");
    const confirmation = String(form.get("confirmation") || "");
    if (!validToken(token)) {
      return NextResponse.json({ error: "The one-time Etsy operation was not authorized." }, { status: 403 });
    }
    if (mode === "audit" && confirmation === "AUDIT ALL ACTIVE LISTINGS") {
      return NextResponse.json(await auditAllActiveMilkweedPromo(getSupabaseServiceClient()));
    }
    const image = form.get("image");
    if (
      mode !== "apply" ||
      confirmation !== "APPLY MILKWEED PROMO TO ALL ACTIVE LISTINGS" ||
      !(image instanceof File)
    ) {
      return NextResponse.json({ error: "The bulk Etsy update was not explicitly confirmed." }, { status: 403 });
    }
    return NextResponse.json(await applyAllActiveMilkweedPromo(getSupabaseServiceClient(), {
      image,
      fileName: image.name || "Base Camp North Milkweed Seed Giveaway.png"
    }));
  } catch (error) {
    console.error("One-time bulk Etsy milkweed promotion failed", {
      message: error instanceof Error ? error.message : "Unknown error",
      listingId: error instanceof BulkPromoError ? error.listingId : null
    });
    return NextResponse.json({
      error: error instanceof Error ? error.message : "The one-time bulk Etsy update failed.",
      listingId: error instanceof BulkPromoError ? error.listingId : null,
      completed: error instanceof BulkPromoError ? error.completed : []
    }, { status: 500 });
  }
}
