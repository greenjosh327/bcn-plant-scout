import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGiveawayReport, weeklyReportCsv, weeklySummaryText, type ReportEntry, type ReportObservation } from "../lib/challenge/reporting";
import { GET, POST } from "../app/api/admin/challenge/route";

const time = "2026-10-19T05:00:00Z";
const records = (user: string, count: number): ReportObservation[] => Array.from({ length: count }, (_, i) => ({ id: `${user}-${i}`, user_id: user, created_at: time, scout_created_at: time, scout_saved_at: new Date(Date.parse(time) + i * 60000).toISOString() }));
const entry = (user: string, email: string, method = "app", status = "eligible"): ReportEntry => ({ id: `${user}-${method}`, user_id: user, full_name: "A Participant", email, method, status, week_id: 1, submitted_at: time });
const report = (extra: Partial<Parameters<typeof buildGiveawayReport>[0]> = {}) => buildGiveawayReport({ observations: [], profiles: [], entries: [], preferences: [], drawings: [], immutable: true, officialDataAvailable: true, entriesEnabled: true, now: new Date("2026-11-17T12:00:00Z"), ...extra });

test("weekly reporting counts unique new records: 9, 10, 15; same species and photos do not change counts", () => {
  const ten = records("ten", 10), fifteen = records("fifteen", 15);
  const rows = report({ observations: [...records("nine", 9), ...ten, ten[0], ...fifteen], profiles: ["nine", "ten", "fifteen"].map(id => ({ id, email: `${id}@example.invalid`, display_name: "same household" })), entries: [entry("ten", "ten@example.invalid"), entry("fifteen", "fifteen@example.invalid")] }).weeks[0];
  assert.deepEqual(rows.counters, { activeUsers: 3, usersWithTen: 2, usersWithOneToNine: 1, newRecords: 34, freeEntries: 0, eligibleParticipants: 2, winners: 0 });
  assert.equal(rows.participants.find(p => p.identifier === "nine")!.eligibility, "not_qualified");
  assert.equal(rows.participants.find(p => p.identifier === "fifteen")!.eligibility, "qualified");
  assert.equal(rows.participants.length, 3);
});

test("immutable timestamps exclude edited old records, saves after cutoff and future timestamps; Eastern DST week is half-open", () => {
  const rows = records("user", 3);
  rows[0].scout_created_at = "2026-10-18T00:00:00Z";
  rows[1].scout_saved_at = "2026-10-26T04:00:00Z";
  rows[2].scout_created_at = "2026-10-19T03:59:59Z";
  const second = { ...records("dst", 1)[0], scout_created_at: "2026-11-02T04:59:59Z", scout_saved_at: "2026-11-02T04:59:59Z" };
  const third = { ...second, id: "third", scout_created_at: "2026-11-02T05:00:00Z", scout_saved_at: "2026-11-02T05:00:00Z" };
  const result = report({ observations: [...rows, second, third] });
  assert.equal(result.weeks[0].counters.newRecords, 0);
  assert.equal(result.weeks[1].counters.newRecords, 1);
  assert.equal(result.weeks[2].counters.newRecords, 1);
  assert.equal(report({ observations: [third], now: new Date(time) }).weeks[2].counters.newRecords, 0);
});

test("preview reports real threshold counts without official tickets; missing schema is unavailable rather than fabricated zero", () => {
  const result = report({ observations: records("user", 10), immutable: false, officialDataAvailable: false, entriesEnabled: false });
  const week = result.weeks[0];
  assert.equal(week.counters.usersWithTen, 1);
  assert.equal(week.counters.freeEntries, null);
  assert.equal(week.counters.eligibleParticipants, null);
  assert.equal(week.participants[0].official, false);
  assert.equal(week.participants[0].eligibility, "qualified");
  assert.match(weeklySummaryText(result, week), /legacy_preview/);
  assert.equal(result.subscriptionConversions.available, false);
});

test("verified free entry needs no records; normalized email/account dedup and opt-out preserve one equal ticket", () => {
  const result = report({ observations: [...records("app", 15), ...records("out", 10)], profiles: [{ id: "app", email: "a@example.invalid", display_name: null }], preferences: [{ user_id: "out", opted_out: true }], entries: [entry("app", " A@example.invalid "), entry("alias", "a@example.invalid", "web", "duplicate"), entry("app", "changed@example.invalid", "web", "duplicate"), entry("free", "free@example.invalid", "web"), entry("out", "out@example.invalid")] });
  const week = result.weeks[0];
  assert.equal(week.counters.eligibleParticipants, 2);
  assert.equal(week.participants.length, 3);
  assert.equal(week.participants.find(p => p.identifier === "free")!.savedPlants, 0);
  assert.equal(week.participants.find(p => p.identifier === "out")!.eligibility, "opted_out");
  assert.equal(week.participants.find(p => p.identifier === "app")!.savedPlants, 15);
});

test("opt-out of app does not exclude an explicitly verified free email entry", () => {
  const week = report({ preferences: [{ user_id: "free", opted_out: true }], entries: [entry("free", "free@example.invalid", "web")] }).weeks[0];
  assert.equal(week.counters.eligibleParticipants, 1);
});

test("CSV quotes commas/newlines and neutralizes spreadsheet formulas without exporting GPS/photos", () => {
  const week = report({ entries: [entry("csv", '=HYPERLINK("bad"),\n@example.invalid', "web")] }).weeks[0];
  const csv = weeklyReportCsv(week);
  assert.match(csv, /'\=HYPERLINK\(""bad""\)/);
  assert.doesNotMatch(csv, /latitude|longitude|photo_uri|access_token/);
  assert.match(csv, /Free Email Entry/);
});

test("admin report/CSV/summary and drawings deny anonymous and non-admin access before private reads", async t => {
  for (const format of ["", "&format=csv", "&format=summary", "&view=analytics"]) assert.equal((await GET(new Request(`https://bcn.test/api/admin/challenge?week=1${format}`))).status, 401);
  const env = { NEXT_PUBLIC_SUPABASE_URL: "https://challenge-test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-only" };
  const prior = { ...process.env }; Object.assign(process.env, env);
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => { const url = String(input); calls.push(url); return new Response(JSON.stringify(url.includes("auth/v1/user") ? { id: "not-admin", email: "test@example.invalid" } : null), { status: 200, headers: { "Content-Type": "application/json" } }); });
  try {
    for (const format of ["", "&format=csv", "&format=summary", "&view=analytics"]) assert.equal((await GET(new Request(`https://bcn.test/api/admin/challenge?week=1${format}`, { headers: { Authorization: "Bearer test-token" } }))).status, 403);
    assert.equal((await POST(new Request("https://bcn.test/api/admin/challenge", { method: "POST", headers: { Authorization: "Bearer test-token" }, body: '{"action":"draw"}' }))).status, 403);
    assert.ok(calls.every(url => /auth\/v1\/user|bcn_admins/.test(url)));
  } finally { for (const key of Object.keys(env)) { if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key]; } }
});

test("authorized previews/CSV/analytics are read-only and do not write official entries, subscriptions or inventory", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-26T12:00:00Z") });
  const keys = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SCOUT_CHALLENGE_ENTRIES_ENABLED", "SCOUT_CHALLENGE_DRAWINGS_ENABLED"];
  const prior = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: "https://challenge-test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-only", SCOUT_CHALLENGE_ENTRIES_ENABLED: "false", SCOUT_CHALLENGE_DRAWINGS_ENABLED: "false" });
  const calls: { url: string; method: string }[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = String(input); calls.push({ url, method: options?.method ?? "GET" }); let body: unknown; let status = 200;
    if (url.includes("auth/v1/user")) body = { id: "admin", email: "admin@example.invalid" };
    else if (url.includes("bcn_admins")) body = { user_id: "admin" };
    else if (url.includes("scout_challenge_config")) { status = 404; body = { code: "PGRST205", message: "Missing table" }; }
    else if (url.includes("observations")) body = records("user", 10);
    else if (url.includes("profiles")) body = [{ id: "user", email: "preview@example.invalid", display_name: null }];
    else throw new Error(`Unexpected request: ${url}`);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  const request = (suffix: string) => new Request(`https://bcn.test/api/admin/challenge?week=1${suffix}`, { headers: { Authorization: "Bearer admin-token" } });
  try {
    const normal = await GET(request("")); assert.equal(normal.status, 200); const body = await normal.json(); assert.equal(body.counters.usersWithTen, 1); assert.equal(body.config.drawings_enabled, false); assert.equal(body.canDraw, false);
    const csv = await GET(request("&format=csv")); assert.equal(csv.status, 200); assert.match(csv.headers.get("Cache-Control")!, /no-store/); assert.match(await csv.text(), /preview@example.invalid/);
    const analytics = await GET(request("&view=analytics")); assert.equal(analytics.status, 200); assert.doesNotMatch(await analytics.text(), /preview@example.invalid|participants":/);
    const summary = await GET(request("&format=summary")); assert.equal(summary.status, 200); assert.doesNotMatch(await summary.text(), /preview@example.invalid/);
    const draw = await POST(new Request("https://bcn.test/api/admin/challenge", { method: "POST", headers: { Authorization: "Bearer admin-token" }, body: '{"action":"draw","week":1,"confirmation":"DRAW WEEK 1"}' })); assert.equal(draw.status, 403);
    assert.ok(calls.every(call => call.method === "GET"));
    assert.ok(calls.filter(c => c.url.includes("observations")).every(c => !/latitude|longitude|photo/.test(c.url)));
    assert.ok(calls.filter(c => c.url.includes("profiles")).every(c => !/plan_role|subscription_status/.test(c.url)));
  } finally { for (const key of keys) { if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key]; } }
});
