import type { SupabaseServiceClient } from "../admin-api";
import { ChallengeError } from "./server";
import { previewCsv, type PreviewRow } from "./preview";
export async function previewReport(db: SupabaseServiceClient, params: URLSearchParams) {
  const week = params.get("week"); const search = (params.get("search") ?? "").trim();
  const offset = Number(params.get("offset") ?? 0);
  if (week && !/^[1-4]$/.test(week) || search.length > 100 || !Number.isInteger(offset) || offset < 0 || offset > 50000) throw new ChallengeError("Invalid preview report filter.");
  if (params.has("format") && params.get("format") !== "csv") throw new ChallengeError("Invalid preview report format.");
  const now = new Date().toISOString();
  function query() {
    let q = db.from("scout_preview_submissions").select("id,full_name,email,state,week,submitted_at,status", { count: "exact" }).gt("expires_at", now).order("submitted_at", { ascending: false }).order("id");
    if (week) q = q.eq("week", Number(week));
    if (search) {
      const pattern = JSON.stringify("%" + search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_") + "%");
      q = q.or(`full_name.ilike.${pattern},email.ilike.${pattern}`);
    }
    return q;
  }
  const total = await db.from("scout_preview_submissions").select("id", { count: "exact", head: true }).gt("expires_at", now);
  if (total.error) throw new ChallengeError("Preview reporting is unavailable.", 503);
  if (params.get("format") !== "csv") {
    const result = await query().range(offset, offset + 99);
    if (result.error) throw new ChallengeError("Preview reporting is unavailable.", 503);
    return { total: total.count ?? 0, filtered: result.count ?? 0, rows: result.data as PreviewRow[], offset, previewOnly: true };
  }
  const rows: PreviewRow[] = [];
  for (let start = 0; start < 50000; start += 1000) {
    const result = await query().range(start, start + 999);
    if (result.error) throw new ChallengeError("Preview export is unavailable.", 503);
    rows.push(...result.data as PreviewRow[]);
    if (result.data.length < 1000) return previewCsv(rows);
  }
  throw new ChallengeError("Export is too large. Narrow the filters.", 413);
}
