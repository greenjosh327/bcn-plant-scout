export const RULES_VERSION = "bcn-scout-2026-draft-v2";
export const DRAWINGS = ["October 26", "November 2", "November 9", "November 16"];
export const STATES = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ");
// Half-open intervals. November 1 crosses the Eastern daylight-saving transition.
export const WEEKS = [
  { id: 1, label: "October 19–25", starts_at: "2026-10-19T04:00:00Z", ends_at: "2026-10-26T04:00:00Z" },
  { id: 2, label: "October 26–November 1", starts_at: "2026-10-26T04:00:00Z", ends_at: "2026-11-02T05:00:00Z" },
  { id: 3, label: "November 2–8", starts_at: "2026-11-02T05:00:00Z", ends_at: "2026-11-09T05:00:00Z" },
  { id: 4, label: "November 9–15", starts_at: "2026-11-09T05:00:00Z", ends_at: "2026-11-16T05:00:00Z" }
] as const;
export function currentWeek(now: Date) {
  return WEEKS.find(w => now.getTime() >= Date.parse(w.starts_at) && now.getTime() < Date.parse(w.ends_at));
}
export function normalizedEmail(value: string) { return value.trim().toLowerCase(); }
export function personReviewKey(name: string, state: string) {
  // A review signal, never an automatic household exclusion.
  return `${name.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ")}|${state}`;
}
export function validateEntry(body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? normalizedEmail(body.email) : "";
  const state = typeof body.state === "string" ? body.state.toUpperCase().trim() : "";
  const week = Number(body.week);
  if (name.length < 2 || name.length > 100 || /[\x00-\x1f]/.test(name)) throw new Error("Enter your full name (2–100 characters).");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (!STATES.includes(state)) throw new Error("Select a U.S. state or D.C.");
  if (!WEEKS.some(w => w.id === week)) throw new Error("Select a contest week.");
  if (body.consent !== true || body.ageConfirmed !== true) throw new Error("Confirm the rules, privacy notice, and age 18+ eligibility.");
  if (typeof body.website !== "string" || body.website !== "") throw new Error("Entry could not be accepted.");
  return { name, email, state, week };
}
export type SavedRecord = { id: string; userId: string; createdAt: string; savedAt: string };
export function savedPlantCount(records: SavedRecord[], userId: string, week: typeof WEEKS[number]) {
  return new Set(records.filter(r => r.userId === userId && [r.createdAt, r.savedAt].every(t => Date.parse(t) >= Date.parse(week.starts_at) && Date.parse(t) < Date.parse(week.ends_at))).map(r => r.id)).size;
}
export function automaticallyQualifies(records: SavedRecord[], userId: string, week: typeof WEEKS[number], optedOut: boolean) {
  return !optedOut && savedPlantCount(records, userId, week) >= 10;
}
export type DrawingCandidate = { id: string; status: string; method: "app" | "web"; emailKey: string };
export function drawingPool(entries: DrawingCandidate[]) {
  if (entries.some(e => e.status === "pending")) throw new Error("Resolve pending entries before drawing.");
  const eligible = entries.filter(e => e.status === "eligible").sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(eligible.map(e => e.emailKey)).size !== eligible.length) throw new Error("Duplicate participant.");
  return eligible; // Exactly one ticket per eligible entry, irrespective of method.
}
export function unbiasedIndex(seed: string, count: number) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000000 || !/^[0-9a-f]{64}$/.test(seed)) throw new Error("Invalid drawing parameters.");
  const limit = Math.floor(4294967296 / count) * count;
  for (let i = 0; i < seed.length; i += 8) { const n = parseInt(seed.slice(i, i + 8), 16); if (n < limit) return n % count; }
  throw new Error("Random sample rejected; retry with fresh entropy.");
}
