import type { SupabaseClient } from "@supabase/supabase-js";
import { WEEKS, RULES_VERSION } from "./core";
import { ChallengeError, publicEnabled, drawingsEnabled, pageVisible } from "./server";
import { buildGiveawayReport, type ReportObservation, type ReportEntry, type ReportProfile, type ReportPreference, type ReportDrawing } from "./reporting";
import { activityWeeks, buildActivityReport } from "./activity";

const missingTable = (error: { code: string } | null) => !!error && ["42P01", "PGRST205"].includes(error.code);
async function pages<T>(query: (start: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; start < 50000; start += 1000) {
    const result = await query(start);
    if (result.error) throw new ChallengeError("Giveaway reporting could not be loaded. No partial totals are shown.", 503);
    const page = result.data ?? []; rows.push(...page as T[]);
    if (page.length < 1000) return rows;
  }
  throw new ChallengeError("Reporting limit exceeded; use a reviewed server export. No truncated totals are shown.", 503);
}
export async function loadPlantScoutActivity(db: SupabaseClient, requestedWeek?: string | null, now = new Date()) {
  const weeks = activityWeeks(now), week = weeks.find(w => w.id === (requestedWeek || weeks[0].id));
  if (!week) throw new ChallengeError("Select a valid activity week from the past year.");
  const preferenceCheck = await db.from("scout_challenge_preferences").select("user_id,opted_out").limit(0);
  if (preferenceCheck.error && !missingTable(preferenceCheck.error)) throw new ChallengeError("Opt-out settings could not be checked. Activity is unavailable.", 503);
  const [observations, profiles, preferences] = await Promise.all([
    pages<ReportObservation>(start => db.from("observations").select("id,user_id,created_at").gte("created_at", week.starts_at).lt("created_at", week.ends_at).lte("created_at", now.toISOString()).is("deleted_at", null).order("id").range(start, start + 999)),
    pages<ReportProfile>(start => db.from("profiles").select("id,email,display_name").order("id").range(start, start + 999)),
    preferenceCheck.error ? Promise.resolve([] as ReportPreference[]) : pages<ReportPreference>(start => db.from("scout_challenge_preferences").select("user_id,opted_out").order("user_id").range(start, start + 999))
  ]);
  return { activity: buildActivityReport({ week, observations, profiles, preferences, now }), activityWeeks: weeks, optOutSettingsAvailable: !preferenceCheck.error };
}
export async function loadGiveawayReporting(db: SupabaseClient, now = new Date()) {
  const configuration = await db.from("scout_challenge_config").select("page_visible,entries_enabled,drawings_enabled,reviewed_at,reviewed_rules_version").single();
  if (configuration.error && !missingTable(configuration.error)) throw new ChallengeError("Giveaway configuration could not be read.", 503);
  const installed = !configuration.error;
  const reviewed = configuration.data?.reviewed_rules_version === RULES_VERSION && !!configuration.data?.reviewed_at;
  const config = { page_visible: pageVisible(), entries_enabled: installed && reviewed && publicEnabled() && !!configuration.data?.entries_enabled, drawings_enabled: installed && reviewed && publicEnabled() && drawingsEnabled() && !!configuration.data?.entries_enabled && !!configuration.data?.drawings_enabled, reviewed_at: configuration.data?.reviewed_at ?? null };
  const observations = await pages<ReportObservation>(start => db.from("observations").select(installed ? "id,user_id,created_at,scout_created_at,scout_saved_at" : "id,user_id,created_at").gte(installed ? "scout_created_at" : "created_at", WEEKS[0].starts_at).lt(installed ? "scout_created_at" : "created_at", WEEKS[3].ends_at).is("deleted_at", null).order("id").range(start, start + 999));
  const [entries, drawings, preferences] = installed ? await Promise.all([
    pages<ReportEntry>(start => db.from("scout_challenge_entries").select("id,week_id,user_id,full_name,email,method,status,submitted_at,review_reason").order("id").range(start, start + 999)),
    pages<ReportDrawing>(start => db.from("scout_challenge_drawings").select("id,week_id,winner_entry_id,drawn_at").order("id").range(start, start + 999)),
    pages<ReportPreference>(start => db.from("scout_challenge_preferences").select("user_id,opted_out").order("user_id").range(start, start + 999))
  ]) : [[], [], []] as [ReportEntry[], ReportDrawing[], ReportPreference[]];
  const ids = [...new Set(observations.map(o => o.user_id).concat(entries.flatMap(e => e.user_id ? [e.user_id] : [])))];
  const profiles: ReportProfile[] = [];
  for (let start = 0; start < ids.length; start += 100) {
    const result = await db.from("profiles").select("id,email,display_name").in("id", ids.slice(start, start + 100));
    if (result.error) throw new ChallengeError("Participant identities could not be loaded.", 503);
    profiles.push(...result.data);
  }
  const report = buildGiveawayReport({ observations, entries, drawings, preferences, profiles, immutable: installed, officialDataAvailable: installed, entriesEnabled: config.entries_enabled, now });
  return { report, config, migrationPending: !installed };
}
