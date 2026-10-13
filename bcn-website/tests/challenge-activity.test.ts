import { test } from "node:test";
import assert from "node:assert/strict";
import { activityWeeks, buildActivityReport, activityCsv, ACTIVITY_ONLY } from "../lib/challenge/activity";
import { GET } from "../app/api/admin/challenge/route";

const now = new Date("2026-10-13T02:00:00Z");
const week = activityWeeks(now)[0];
const profiles = ["member", "friend", "trial", "expired", "out"].map(id => ({ id, email: `${id}@example.invalid`, display_name: id }));
const records = (id: string, count: number) => Array.from({ length: count }, (_, i) => ({ id: `${id}-${i}`, user_id: id, created_at: "2026-10-12T10:00:00Z" }));

test("activity weeks use current Eastern Monday and correct DST boundaries", () => {
  assert.equal(week.id, "2026-10-12");
  assert.equal(week.starts_at, "2026-10-12T04:00:00.000Z");
  const dst = activityWeeks(new Date("2026-11-01T18:00:00Z"))[0];
  assert.equal(dst.id, "2026-10-26");
  assert.equal(Date.parse(dst.ends_at) - Date.parse(dst.starts_at), 169 * 3600000);
  assert.equal(activityWeeks(new Date("2026-10-12T03:59:59Z"))[0].id, "2026-10-05");
});
test("all accounts including zero saves are reported without role/subscription filtering; unique records count", () => {
  const observations = [...records("member", 10), ...records("friend", 1), ...records("trial", 9), ...records("expired", 15)];
  const result = buildActivityReport({ week, observations: [...observations, observations[0]], profiles, preferences: [], now });
  assert.equal(result.users.length, 5);
  assert.equal(result.counters.newRecords, 35);
  assert.equal(result.counters.usersWithTen, 2);
  assert.equal(result.users.find(u => u.id === "out")!.savedPlants, 0);
  assert.ok(result.users.every(u => u.status === ACTIVITY_ONLY));
  assert.doesNotMatch(JSON.stringify(result), /entryId|qualified|latitude|longitude|photo_uri/);
});
test("activity excludes saved opt-outs, future timestamps, old edited records and weekly cutoff", () => {
  const result = buildActivityReport({ week, profiles, preferences: [{ user_id: "out", opted_out: true }], observations: [...records("out", 10), { id: "old", user_id: "member", created_at: "2026-10-05T04:00:00Z" }, { id: "future", user_id: "member", created_at: "2026-10-19T04:00:00Z" }], now });
  assert.equal(result.counters.newRecords, 0);
  assert.equal(result.users.some(u => u.id === "out"), false);
  assert.equal(result.counters.optedOutAccountsExcluded, 1);
});
test("activity CSV marks every row as activity only and neutralizes formulas", () => {
  const result = buildActivityReport({ week, profiles: [{ id: "a", email: "=BAD@example.invalid", display_name: null }], observations: [], preferences: [], now });
  const csv = activityCsv(result);
  assert.match(csv, /'=BAD/); assert.match(csv, /Activity Only — Not Official Contest Entries/);
  assert.doesNotMatch(csv, /Winner|Official entry\"/);
});
test("activity API and CSV require admin auth and use only reads for all accounts", async t => {
  assert.equal((await GET(new Request("https://bcn.test/api/admin/challenge?mode=activity"))).status, 401);
  assert.equal((await GET(new Request("https://bcn.test/api/admin/challenge?mode=activity&format=csv"))).status, 401);
  const keys = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], old = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-only" });
  t.mock.timers.enable({ apis: ["Date"], now: now.getTime() });
  const calls: { url: string; method: string }[] = [];
  let adminAllowed = true;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, method: init?.method ?? "GET" }); let body: unknown; let status = 200;
    if (url.includes("auth/v1/user")) body = { id: "admin", email: "admin@example.invalid" };
    else if (url.includes("bcn_admins")) body = adminAllowed ? { user_id: "admin" } : null;
    else if (url.includes("scout_challenge_preferences")) { body = { code: "PGRST205" }; status = 404; }
    else if (url.includes("observations")) body = records("member", 10);
    else if (url.includes("profiles")) body = profiles;
    else throw new Error(`Unexpected query ${url}`);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  const request = (suffix = "") => new Request(`https://bcn.test/api/admin/challenge?mode=activity${suffix}`, { headers: { Authorization: "Bearer test-admin" } });
  try {
    const response = await GET(request()); assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.activity.users.length, 5); assert.equal(body.activity.counters.usersWithTen, 1);
    assert.equal((await GET(request("&format=csv"))).status, 200);
    assert.equal((await GET(request("&activityWeek=2026-10-13"))).status, 400);
    assert.ok(calls.every(c => c.method === "GET"));
    assert.ok(calls.filter(c => c.url.includes("profiles")).every(c => !/plan_role|subscription_status|role=|friend/.test(c.url)));
    assert.ok(calls.filter(c => c.url.includes("observations")).every(c => !/latitude|longitude|photo/.test(c.url)));
    assert.ok(calls.every(c => !/scout_challenge_entries|scout_challenge_drawings|rpc\//.test(c.url)));
    const before = calls.filter(c => /observations|profiles/.test(c.url)).length;
    adminAllowed = false; assert.equal((await GET(request())).status, 403);
    assert.equal(calls.filter(c => /observations|profiles/.test(c.url)).length, before);
  } finally { for (const k of keys) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } }
});
