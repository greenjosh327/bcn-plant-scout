import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";
import {
  applyBottlebrushBuckeye,
  auditBottlebrushBuckeye,
  BottlebrushOperationError
} from "@/lib/etsy/one-time-bottlebrush-buckeye";

export const runtime = "nodejs";
export const maxDuration = 300;

const TOKEN_HASH = "9cc3ad3c03bad897c8658fae725008c040abc0791386e932560c86eb1f9ec27f";

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
    if (!validToken(token)) return NextResponse.json({ error: "Unauthorized operation." }, { status: 403 });
    const supabase = getSupabaseServiceClient();
    if (mode === "audit" && confirmation === "AUDIT BOTTLEBRUSH BUCKEYE") {
      return NextResponse.json(await auditBottlebrushBuckeye(supabase));
    }
    const main = form.get("main");
    const parent = form.get("parent");
    const opened = form.get("opened");
    if (mode !== "apply" || confirmation !== "CREATE BOTTLEBRUSH BUCKEYE DRAFT AND BCN PRODUCT" ||
        !(main instanceof File) || !(parent instanceof File) || !(opened instanceof File)) {
      return NextResponse.json({ error: "The operation was not explicitly confirmed." }, { status: 403 });
    }
    return NextResponse.json(await applyBottlebrushBuckeye(
      supabase,
      String(form.get("fingerprint") || ""),
      { main, parent, opened }
    ));
  } catch (error) {
    console.error("Bottlebrush Buckeye operation failed", {
      message: error instanceof Error ? error.message : "Unknown error",
      listingId: error instanceof BottlebrushOperationError ? error.listingId : null
    });
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Bottlebrush Buckeye operation failed.",
      listingId: error instanceof BottlebrushOperationError ? error.listingId : null
    }, { status: error instanceof BottlebrushOperationError ? error.status : 500 });
  }
}
