import { randomBytes, randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/admin-api";
import { getSupabaseServiceClient } from "@/lib/supabase-service";
import { ChallengeError, drawingsEnabled, jsonBody, pageVisible, publicEnabled } from "@/lib/challenge/server";
import { challengeFailure, challengeResponse } from "@/lib/challenge/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function adminDb(request: Request) {
  if (!request.headers.get("authorization")?.startsWith("Bearer ")) throw new ChallengeError("Admin session is missing.", 401);
  const db = getSupabaseServiceClient(); const admin = await requireAdmin(request, db);
  if ("error" in admin) throw new ChallengeError(admin.error ?? "Admin access required.", admin.status ?? 403);
  return { db, user: admin.user };
}
export async function GET(request: Request) {
  try {
    const { db } = await adminDb(request); const params = new URL(request.url).searchParams;
    const week = Number(params.get("week") ?? 1); if (![1, 2, 3, 4].includes(week)) throw new ChallengeError("Invalid week.");
    if (params.get("photo")) throw new ChallengeError("Giveaway photo review is not used.");
    const [configuration, users] = await Promise.all([
      db.from("scout_challenge_config").select("page_visible,entries_enabled,drawings_enabled,reviewed_at").single(),
      db.from("profiles").select("id", { count: "exact", head: true })
    ]);
    if (users.error) throw new Error();
    if (configuration.error) {
      if (!["42P01", "PGRST205"].includes(configuration.error.code)) throw new Error();
      return challengeResponse({ entries: [], progress: [], drawings: [], fulfillment: [], seeds: [], audit: [], preferences: [], totalAppUsers: users.count ?? 0, migrationPending: true, config: { page_visible: pageVisible(), entries_enabled: false, drawings_enabled: false, reviewed_at: null } });
    }
    async function all(table: string) {
      const rows: Record<string, unknown>[] = [];
      for (let offset = 0; offset < 50000; offset += 1000) {
        const result = await db.from(table).select("*").eq("week_id", week).order("id").range(offset, offset + 999);
        if (result.error) throw new Error(); rows.push(...result.data);
        if (result.data.length < 1000) return rows;
      }
      throw new ChallengeError("Too many records for this view. Use a reviewed server export before drawing.", 503);
    }
    const [entries, progress, drawings, audit, seeds, preferences] = await Promise.all([
      all("scout_challenge_entries"), all("scout_challenge_progress"), all("scout_challenge_drawings"),
      db.from("scout_challenge_audit").select("*").eq("week_id", week).order("id", { ascending: false }).limit(100),
      db.from("products").select("id,name,inventory").eq("category", "Seeds").eq("active", true).gt("inventory", 0),
      db.from("scout_challenge_preferences").select("user_id,opted_out")
    ]);
    if (audit.error || seeds.error || preferences.error) throw new Error();
    const ids = drawings.map(d => d.id);
    const fulfillment = ids.length ? await db.from("scout_challenge_fulfillment").select("*").in("drawing_id", ids) : { data: [], error: null };
    if (fulfillment.error) throw new Error();
    return challengeResponse({ entries, progress, drawings, config: { ...configuration.data, page_visible: pageVisible() && configuration.data.page_visible, entries_enabled: publicEnabled() && configuration.data.entries_enabled, drawings_enabled: drawingsEnabled() && configuration.data.drawings_enabled }, audit: audit.data, seeds: seeds.data, fulfillment: fulfillment.data, preferences: preferences.data, totalAppUsers: users.count ?? 0 });
  } catch (error) { return challengeFailure(error); }
}
export async function POST(request: Request) {
  try {
    const { db, user } = await adminDb(request); const body = await jsonBody(request);
    const id = typeof body.id === "string" ? body.id : "";
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
    let result;
    if (body.action === "review_entry") {
      if (!["eligible", "duplicate", "ineligible", "pending", "withdrawn"].includes(String(body.status))) throw new ChallengeError("Invalid eligibility status.");
      result = await db.rpc("scout_challenge_review_entry", { p_id: id, p_actor: user.id, p_status: body.status, p_reason: reason });
    } else if (body.action === "draw") {
      if (!drawingsEnabled()) throw new ChallengeError("Winner drawings are disabled.", 403);
      const week = Number(body.week);
      if (![1, 2, 3, 4].includes(week) || body.confirmation !== `DRAW WEEK ${week}`) throw new ChallengeError("Confirm the weekly drawing.");
      // Cryptographically secure entropy generated exclusively on the backend.
      result = await db.rpc("scout_challenge_draw", { p_id: randomUUID(), p_week: week, p_actor: user.id, p_entropy: randomBytes(32).toString("hex") });
    } else if (body.action === "fulfillment") {
      if (!["pending", "notified", "responded"].includes(String(body.notification)) || !["pending", "packed", "shipped", "delivered"].includes(String(body.status))) throw new ChallengeError("Invalid fulfillment status.");
      const products = Array.isArray(body.products) ? body.products : [];
      if (products.length > 3 || products.some(p => typeof p !== "string" || p.length > 100)) throw new ChallengeError("Invalid seed pack selection.");
      const approved = (process.env.SCOUT_CHALLENGE_SEED_IDS ?? "").split(",").map(v => v.trim());
      if (products.some(p => !approved.includes(p))) throw new ChallengeError("Seed pack is not on the reviewed prize list.");
      result = await db.rpc("scout_challenge_fulfill", { p_id: id, p_actor: user.id, p_notification: body.notification, p_status: body.status, p_products: products, p_tracking: typeof body.tracking === "string" ? body.tracking.slice(0, 100) : "" });
    } else throw new ChallengeError("Unknown admin action.");
    if (result.error) throw new ChallengeError("Action was not completed. Resolve reviews, deadlines, stock, and prior drawing status before retrying.", 409);
    return challengeResponse({ message: "Contest record saved.", result: result.data });
  } catch (error) { return challengeFailure(error); }
}
