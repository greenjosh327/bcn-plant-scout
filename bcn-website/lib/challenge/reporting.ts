import { WEEKS } from "./core";

export type ReportObservation = { id: string; user_id: string; created_at: string; scout_created_at?: string | null; scout_saved_at?: string | null };
export type ReportEntry = { id: string; week_id: number; user_id: string | null; full_name: string; email: string; method: string; status: string; submitted_at: string; review_reason?: string | null };
export type ReportProfile = { id: string; display_name: string | null; email: string | null };
export type ReportPreference = { user_id: string; opted_out: boolean };
export type ReportDrawing = { id: string; week_id: number; winner_entry_id: string; drawn_at: string };
export type Participant = { identifier: string; label: string; method: "app" | "web"; savedPlants: number; eligibility: "qualified" | "not_qualified" | "opted_out"; qualificationDate: string | null; winner: boolean; entryId: string | null; entryStatus: string | null; official: boolean; detail: string };
export type WeeklyCounters = { activeUsers: number; usersWithTen: number; usersWithOneToNine: number; freeEntries: number | null; eligibleParticipants: number | null; newRecords: number; winners: number | null };
export type WeekReport = { week: number; label: string; counters: WeeklyCounters; participants: Participant[] };
export type GiveawayReport = { weeks: WeekReport[]; timestampBasis: "immutable" | "legacy_preview"; officialDataAvailable: boolean; generatedAt: string; subscriptionConversions: { available: false; reason: string } };

export function buildGiveawayReport(input: { observations: ReportObservation[]; entries: ReportEntry[]; profiles: ReportProfile[]; preferences: ReportPreference[]; drawings: ReportDrawing[]; immutable: boolean; officialDataAvailable: boolean; entriesEnabled: boolean; now?: Date }): GiveawayReport {
  const now = input.now ?? new Date();
  const profiles = new Map(input.profiles.map(p => [p.id, p]));
  const optedOut = new Set(input.preferences.filter(p => p.opted_out).map(p => p.user_id));
  const links = new Map<string, string>();
  function root(key: string): string { const parent = links.get(key); return parent && parent !== key ? root(parent) : key; }
  function join(userId: string | null, email: string | null) {
    if (!userId || !email?.trim()) return;
    const a = root(`id:${userId}`), b = root(`email:${email.trim().toLowerCase()}`);
    if (a !== b) links.set(a, b);
  }
  for (const p of input.profiles) join(p.id, p.email);
  for (const e of input.entries) join(e.user_id, e.email);
  const weeks = WEEKS.map(week => {
    const records = new Map<string, Map<string, string>>();
    for (const record of input.observations) {
      const created = input.immutable ? record.scout_created_at : record.created_at;
      const saved = input.immutable ? record.scout_saved_at : record.created_at;
      if (!record.user_id || !created || !saved) continue;
      const c = Date.parse(created), s = Date.parse(saved);
      if (!(c >= Date.parse(week.starts_at) && c < Date.parse(week.ends_at) && s >= Date.parse(week.starts_at) && s < Date.parse(week.ends_at) && c <= now.getTime() && s <= now.getTime())) continue;
      const userRecords = records.get(record.user_id) ?? new Map<string, string>();
      userRecords.set(record.id, saved); records.set(record.user_id, userRecords);
    }
    const entries = input.entries.filter(e => e.week_id === week.id);
    const winners = new Set(input.drawings.filter(d => d.week_id === week.id).map(d => d.winner_entry_id));
    const participants = new Map<string, Participant>();
    const personKey = (email: string | null | undefined, fallback: string) => root(email?.trim() ? `email:${email.trim().toLowerCase()}` : `id:${fallback}`);
    for (const [userId, saved] of records) {
      const profile = profiles.get(userId);
      const key = personKey(profile?.email, userId);
      const out = optedOut.has(userId);
      const qualified = saved.size >= 10 && !out;
      const row: Participant = { identifier: userId, label: profile?.email || profile?.display_name || userId, method: "app", savedPlants: saved.size, eligibility: out ? "opted_out" : !input.entriesEnabled && qualified ? "qualified" : "not_qualified", qualificationDate: qualified ? [...saved.values()].sort((a, b) => Date.parse(a) - Date.parse(b))[9] : null, winner: false, entryId: null, entryStatus: null, official: false, detail: out ? "Opted out" : input.entriesEnabled ? "No official eligible entry recorded" : "Preview only; record threshold is not an official entry" };
      const prior = participants.get(key);
      if (!prior || prior.savedPlants < row.savedPlants) participants.set(key, row);
    }
    // Verified email and account identity are deduplication keys; never household/IP.
    // Prefer the existing eligible ticket if older/stale duplicates are present.
    const priority = (e: ReportEntry) => (winners.has(e.id) ? 4 : e.status === "eligible" ? 3 : e.status === "pending" ? 2 : 1);
    const chosen = new Map<string, ReportEntry>();
    for (const entry of entries) {
      const key = personKey(entry.email || (entry.user_id ? profiles.get(entry.user_id)?.email : null), entry.user_id ?? entry.id);
      const existing = chosen.get(key);
      if (!existing || priority(entry) > priority(existing)) chosen.set(key, entry);
    }
    for (const [key, entry] of chosen) {
      const accountKey = entry.user_id ? personKey(profiles.get(entry.user_id)?.email, entry.user_id) : key;
      const progress = participants.get(key) ?? participants.get(accountKey);
      if (accountKey !== key) participants.delete(accountKey);
      const out = entry.method === "app" && (optedOut.has(entry.user_id ?? "") || entry.status === "withdrawn");
      participants.set(key, { identifier: entry.user_id ?? entry.id, label: entry.email || entry.full_name || "Deleted account", method: entry.method === "web" ? "web" : "app", savedPlants: progress?.savedPlants ?? 0, eligibility: out ? "opted_out" : entry.status === "eligible" ? "qualified" : "not_qualified", qualificationDate: entry.status === "eligible" ? (entry.method === "web" ? entry.submitted_at : progress?.qualificationDate ?? entry.submitted_at) : null, winner: winners.has(entry.id), entryId: entry.id, entryStatus: entry.status, official: true, detail: entry.review_reason || (entry.status === "pending" ? "Eligibility/identity review pending" : entry.status) });
    }
    const rows = [...participants.values()].sort((a, b) => b.savedPlants - a.savedPlants || a.identifier.localeCompare(b.identifier));
    const counts = [...records.values()].map(v => v.size);
    return { week: week.id, label: week.label, participants: rows, counters: { activeUsers: records.size, usersWithTen: counts.filter(n => n >= 10).length, usersWithOneToNine: counts.filter(n => n > 0 && n < 10).length, newRecords: counts.reduce((a, b) => a + b, 0), freeEntries: input.officialDataAvailable ? new Set(entries.filter(e => e.method === "web").map(e => personKey(e.email, e.user_id ?? e.id))).size : null, eligibleParticipants: input.officialDataAvailable ? rows.filter(p => p.official && p.eligibility === "qualified").length : null, winners: input.officialDataAvailable ? winners.size : null } };
  });
  return { weeks, timestampBasis: input.immutable ? "immutable" : "legacy_preview", officialDataAvailable: input.officialDataAvailable, generatedAt: now.toISOString(), subscriptionConversions: { available: false, reason: "Unavailable: no reliable RevenueCat purchase/renewal event history is stored in the existing reporting database. Profile roles or subscription_status do not establish contest conversions." } };
}

export function weeklyReportCsv(week: WeekReport) {
  const escape = (value: unknown) => {
    const text = String(value ?? "");
    // Prevent spreadsheet formula injection, including leading control/whitespace.
    const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const rows: unknown[][] = [["Contest week", "Participant identifier", "Entry method", "Saved plant count", "Eligibility", "Qualification date (UTC)", "Winner status", "Official entry"]];
  for (const p of week.participants) rows.push([`Week ${week.week}: ${week.label}`, p.label, p.method === "app" ? "Plant Scout" : "Free Email Entry", p.savedPlants, p.eligibility === "qualified" ? p.official ? "Qualified" : "Qualified threshold - preview only" : p.eligibility === "opted_out" ? "Opted Out" : "Not Qualified", p.qualificationDate, p.winner ? "Winner" : "Not selected", p.official ? "Yes" : "No"]);
  return "\uFEFF" + rows.map(row => row.map(escape).join(",")).join("\r\n") + "\r\n";
}

export function weeklySummaryText(report: GiveawayReport, week: WeekReport) {
  const c = week.counters, show = (n: number | null) => n === null ? "Unavailable (contest schema pending)" : String(n);
  return [`BCN Weekly Giveaway - Week ${week.week}: ${week.label} (Eastern Time)`, `Generated: ${report.generatedAt}`, `Weekly active accounts (1+ new saved records): ${c.activeUsers}`, `Accounts with 10+ records: ${c.usersWithTen}`, `Accounts with 1-9 records: ${c.usersWithOneToNine}`, `New plant records: ${c.newRecords}`, `Verified free email entries: ${show(c.freeEntries)}`, `Official eligible participants: ${show(c.eligibleParticipants)}`, `Winners: ${show(c.winners)}`, `Timestamp basis: ${report.timestampBasis}; previews create no official entries`, report.subscriptionConversions.reason].join("\n");
}
