import { timingSafeEqual } from "node:crypto";
import { getSupabaseServiceClient } from "@/lib/supabase-service";
import { challengeResponse } from "@/lib/challenge/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  if (!secret || secret.length < 32 || provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return challengeResponse({ error: "Unauthorized" }, 401);
  try {
    const result = await getSupabaseServiceClient().rpc("scout_preview_purge");
    if (result.error) throw new Error();
    return challengeResponse({ deleted: result.data, previewOnly: true });
  } catch { return challengeResponse({ error: "Preview cleanup failed." }, 503); }
}
