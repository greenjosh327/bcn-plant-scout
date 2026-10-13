import { challengeFailure, challengeResponse } from "@/lib/challenge/http";
import { currentWeek, WEEKS } from "@/lib/challenge/core";
import { available, ChallengeError, challengeUser, drawingsEnabled, pageVisible, publicEnabled, webEntry } from "@/lib/challenge/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!publicEnabled()) return challengeResponse({ open: false, pageVisible: pageVisible(), entriesEnabled: false, drawingsEnabled: false, weeks: WEEKS });
  try {
    const db = await available(); const week = currentWeek(new Date());
    if (!request.headers.get("authorization")) return challengeResponse({ open: Boolean(week), week, weeks: WEEKS });
    const user = await challengeUser(request, db);
    if (!week) return challengeResponse({ open: false, weeks: WEEKS, progress: [] });
    const synced = await db.rpc("scout_challenge_sync_user", { p_user: user.id, p_week: week.id });
    if (synced.error) throw new Error();
    const [progress, entries, preferences] = await Promise.all([
      db.from("scout_challenge_progress").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("week_id", week.id),
      db.from("scout_challenge_entries").select("status,method,submitted_at").eq("week_id", week.id).eq("email_key", user.email!.trim().toLowerCase()),
      db.from("scout_challenge_preferences").select("opted_out,age_confirmed,state,rules_acknowledged").eq("user_id", user.id).maybeSingle()
    ]);
    if (progress.error || entries.error || preferences.error) throw new Error();
    return challengeResponse({ open: true, entriesEnabled: true, drawingsEnabled: drawingsEnabled(), week, weeks: WEEKS, savedPlants: progress.count ?? 0, preferences: preferences.data ?? { opted_out: false }, entry: entries.data?.[0] ?? null });
  } catch (error) { return challengeFailure(error); }
}
export async function POST(request: Request) { try { return challengeResponse(await webEntry(request)); } catch (error) { return challengeFailure(error); } }
