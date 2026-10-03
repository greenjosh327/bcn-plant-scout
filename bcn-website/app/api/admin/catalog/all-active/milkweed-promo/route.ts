import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";
import {
  applyAllActiveShopMilkweedPromo,
  auditAllActiveShopMilkweedPromo,
  ShopPromoError
} from "@/lib/one-time-active-shop-milkweed-promo";

export const runtime = "nodejs";
export const maxDuration = 300;

const TOKEN_HASH = "53105163d9340ead3acaee82c85d39123a698759d179dc0e3cf1a89c1c5a69bc";

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
      return NextResponse.json({ error: "The one-time BCN catalog operation was not authorized." }, { status: 403 });
    }
    if (mode === "audit" && confirmation === "AUDIT ALL ACTIVE BCN PRODUCTS") {
      return NextResponse.json(await auditAllActiveShopMilkweedPromo(getSupabaseServiceClient()));
    }
    const image = form.get("image");
    if (
      mode !== "apply" ||
      confirmation !== "APPLY MILKWEED PROMO TO ALL ACTIVE BCN PRODUCTS" ||
      !(image instanceof File)
    ) {
      return NextResponse.json({ error: "The BCN catalog update was not explicitly confirmed." }, { status: 403 });
    }
    return NextResponse.json(
      await applyAllActiveShopMilkweedPromo(getSupabaseServiceClient(), { image })
    );
  } catch (error) {
    console.error("One-time BCN catalog milkweed promotion failed", {
      message: error instanceof Error ? error.message : "Unknown error",
      productId: error instanceof ShopPromoError ? error.productId : null
    });
    return NextResponse.json({
      error: error instanceof Error ? error.message : "The one-time BCN catalog update failed.",
      productId: error instanceof ShopPromoError ? error.productId : null,
      completed: error instanceof ShopPromoError ? error.completed : []
    }, { status: 500 });
  }
}
