import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";
import { applyOneTimeMilkweedPromo } from "@/lib/etsy/one-time-milkweed-promo";

export const runtime = "nodejs";
export const maxDuration = 60;

const TOKEN_HASH = "6bca6d8d2b2708b709e454543aad244e533938949e74e4f9b0a53e930c39a7d7";
const CONFIRMATION = "APPLY MILKWEED PROMO TO 4587905409";

function validToken(token: string) {
  const actual = Buffer.from(createHash("sha256").update(token, "utf8").digest("hex"), "utf8");
  const expected = Buffer.from(TOKEN_HASH, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const token = String(form.get("token") || "");
    const confirmation = String(form.get("confirmation") || "");
    const image = form.get("image");
    if (!validToken(token) || confirmation !== CONFIRMATION || !(image instanceof File)) {
      return NextResponse.json({ error: "The one-time Etsy operation was not authorized." }, { status: 403 });
    }
    const result = await applyOneTimeMilkweedPromo(getSupabaseServiceClient(), {
      image,
      fileName: image.name || "Base Camp North Milkweed Seed Giveaway.png"
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("One-time Etsy milkweed promotion failed", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The one-time Etsy update failed." },
      { status: 500 }
    );
  }
}
