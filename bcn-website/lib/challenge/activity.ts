import type { ReportObservation, ReportPreference, ReportProfile } from "./reporting";

export const ACTIVITY_ONLY = "Activity Only — Not Official Contest Entries";
function dateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}-${parts.find(p => p.type === "day")!.value}`;
}
function shift(day: string, days: number) { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function easternMidnight(day: string) {
  const midnight = Date.parse(`${day}T00:00:00Z`);
  let instant = midnight;
  for (let i = 0; i < 3; i++) {
    const offset = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" }).formatToParts(new Date(instant)).find(p => p.type === "timeZoneName")!.value;
    const match = /GMT([+-])(\d+)(?::(\d+))?/.exec(offset);
    const minutes = match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : 0;
    instant = midnight - minutes * 60000;
  }
  return new Date(instant).toISOString();
}
export function activityWeeks(now = new Date()) {
  const today = dateKey(now), weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = shift(today, -((weekday + 6) % 7));
  return Array.from({ length: 53 }, (_, i) => {
    const start = shift(monday, -i * 7), end = shift(start, 7);
    const label = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", dateStyle: "medium" }).formatRange(new Date(`${start}T12:00:00Z`), new Date(`${shift(end, -1)}T12:00:00Z`));
    return { id: start, label: `${label}${i === 0 ? " (current week)" : ""}`, starts_at: easternMidnight(start), ends_at: easternMidnight(end) };
  });
}
export function buildActivityReport(input: { week: ReturnType<typeof activityWeeks>[number]; observations: ReportObservation[]; profiles: ReportProfile[]; preferences: ReportPreference[]; now?: Date }) {
  const now = input.now ?? new Date(), out = new Set(input.preferences.filter(p => p.opted_out).map(p => p.user_id));
  const counts = new Map<string, Set<string>>();
  for (const r of input.observations) {
    const created = Date.parse(r.created_at);
    if (!r.user_id || out.has(r.user_id) || !(created >= Date.parse(input.week.starts_at) && created < Date.parse(input.week.ends_at) && created <= now.getTime())) continue;
    const ids = counts.get(r.user_id) ?? new Set<string>(); ids.add(r.id); counts.set(r.user_id, ids);
  }
  const accounts = new Map(input.profiles.filter(p => !out.has(p.id)).map(p => [p.id, p.email || p.display_name || p.id]));
  for (const user of counts.keys()) if (!accounts.has(user)) accounts.set(user, user);
  const users = [...accounts].map(([id, label]) => ({ id, label, savedPlants: counts.get(id)?.size ?? 0, reachedTen: (counts.get(id)?.size ?? 0) >= 10, status: ACTIVITY_ONLY })).sort((a, b) => b.savedPlants - a.savedPlants || a.id.localeCompare(b.id));
  return { label: ACTIVITY_ONLY, week: input.week, users, counters: { totalAccounts: users.length, activeUsers: users.filter(u => u.savedPlants > 0).length, usersWithTen: users.filter(u => u.reachedTen).length, usersWithOneToNine: users.filter(u => u.savedPlants > 0 && u.savedPlants < 10).length, newRecords: users.reduce((total, u) => total + u.savedPlants, 0), optedOutAccountsExcluded: out.size }, generatedAt: now.toISOString() };
}
export type ActivityReport = ReturnType<typeof buildActivityReport>;
export function activityCsv(report: ActivityReport) {
  const cell = (value: unknown) => { const text = String(value); const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"`; };
  return "\uFEFF" + [["Activity week (ET)", "Account", "Saved plant records", "Reached 10", "Status"], ...report.users.map(u => [report.week.label, u.label, u.savedPlants, u.reachedTen ? "Yes" : "No", ACTIVITY_ONLY])].map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
