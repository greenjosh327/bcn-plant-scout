import { randomBytes, randomUUID } from "node:crypto";
import { ChallengeError, available, drawingsEnabled, jsonBody, publicEnabled } from "@/lib/challenge/server";
import { challengeAdmin } from "@/lib/challenge/admin";
import { loadGiveawayReporting } from "@/lib/challenge/reporting-server";
import { weeklyReportCsv, weeklySummaryText } from "@/lib/challenge/reporting";
import { WEEKS } from "@/lib/challenge/core";
import { challengeFailure, challengeResponse } from "@/lib/challenge/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { db } = await challengeAdmin(request); const params = new URL(request.url).searchParams;
    const week = Number(params.get("week") ?? 1); if (![1, 2, 3, 4].includes(week)) throw new ChallengeError("Invalid week.");
    if (params.get("photo")) throw new ChallengeError("Giveaway photo review is not used.");
    const { report, config, migrationPending } = await loadGiveawayReporting(db);
    const selected = report.weeks.find(w => w.week === week)!;
    const summaryText = weeklySummaryText(report, selected);
    const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
    if (params.get("format") === "csv") return new Response(weeklyReportCsv(selected), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="bcn-giveaway-week-${week}.csv"` } });
    if (params.get("format") === "summary") return new Response(summaryText, { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
    if (params.has("format")) throw new ChallengeError("Invalid report format.");
    const aggregate = { ...report, weeks: report.weeks.map(({ participants: _participants, ...w }) => w) };
    if (params.get("view") === "analytics") return challengeResponse({ report: aggregate, config, migrationPending });
    const base = { report: aggregate, participants: selected.participants, counters: selected.counters, summaryText, config, migrationPending, canDraw: config.drawings_enabled && (selected.counters.eligibleParticipants ?? 0) > 0 && !selected.participants.some(p => p.entryStatus === "pending") && Date.now() >= Date.parse(WEEKS[week - 1].ends_at) && new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric" }).format(new Date()) === new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric" }).format(new Date(WEEKS[week - 1].ends_at)) };
    if (migrationPending) return challengeResponse({ ...base, entries: [], drawings: [], fulfillment: [], seeds: [], audit: [] });
    async function all(table: string) {
      const rows: Record<string, unknown>[] = [];
      for (let offset = 0; offset < 50000; offset += 1000) {
        const result = await db.from(table).select("*").eq("week_id", week).order("id").range(offset, offset + 999);
        if (result.error) throw new Error(); rows.push(...result.data);
        if (result.data.length < 1000) return rows;
      }
      throw new ChallengeError("Too many records for this view. Use a reviewed server export before drawing.", 503);
    }
    const [entries, drawings, audit, seeds] = await Promise.all([
      all("scout_challenge_entries"), all("scout_challenge_drawings"),
      db.from("scout_challenge_audit").select("*").eq("week_id", week).order("id", { ascending: false }).limit(100),
      db.from("products").select("id,name,inventory").eq("category", "Seeds").eq("active", true).eq("price", 5.99).eq("product_type", "standard").gt("inventory", 0)
    ]);
    if (audit.error || seeds.error) throw new Error();
    const ids = drawings.map(d => d.id);
    const fulfillment = ids.length ? await db.from("scout_challenge_fulfillment").select("*").in("drawing_id", ids) : { data: [], error: null };
    if (fulfillment.error) throw new Error();
    const selectedSeedIds = [...new Set((fulfillment.data ?? []).flatMap(f => f.seed_product_ids as string[]))];
    const selectedSeeds = selectedSeedIds.length ? await db.from("products").select("id,name").in("id", selectedSeedIds) : { data: [], error: null };
    if (selectedSeeds.error) throw new Error();
    const approved = new Set((process.env.SCOUT_CHALLENGE_SEED_IDS ?? "").split(",").map(v => v.trim()).filter(Boolean));
    return challengeResponse({ ...base, canDraw: base.canDraw && !drawings.length && !entries.some(e => e.status === "pending"), entries, drawings, audit: audit.data, seeds: seeds.data.filter(s => approved.has(s.id)), selectedSeeds: selectedSeeds.data, fulfillment: fulfillment.data });
  } catch (error) { return challengeFailure(error); }
}
export async function POST(request: Request) {
  try {
    const { db, user } = await challengeAdmin(request); const body = await jsonBody(request);
    const id = typeof body.id === "string" ? body.id : "";
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
    let result;
    if (body.action === "review_entry") {
      if (!["eligible", "duplicate", "ineligible", "pending", "withdrawn"].includes(String(body.status))) throw new ChallengeError("Invalid eligibility status.");
      result = await db.rpc("scout_challenge_review_entry", { p_id: id, p_actor: user.id, p_status: body.status, p_reason: reason });
    } else if (body.action === "draw") {
      if (!publicEnabled() || !drawingsEnabled()) throw new ChallengeError("Winner drawings are disabled.", 403);
      await available(); // Also require reviewed rules and the database entry gate.
      const week = Number(body.week);
      if (![1, 2, 3, 4].includes(week) || body.confirmation !== `DRAW WEEK ${week}`) throw new ChallengeError("Confirm the weekly drawing.");
      if (Date.now() < Date.parse(WEEKS[week - 1].ends_at)) throw new ChallengeError("The selected contest week has not closed.", 403);
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
