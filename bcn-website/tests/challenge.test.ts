import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { automaticallyQualifies, currentWeek, drawingPool, savedPlantCount, personReviewKey, unbiasedIndex, validateEntry, WEEKS } from "../lib/challenge/core";
import { privateJpeg } from "../lib/challenge/jpeg";
import { available, boundedBody, webEntry } from "../lib/challenge/server";

test("Eastern weekly boundaries include the November DST change", () => {
  assert.equal(currentWeek(new Date("2026-10-19T03:59:59.999Z")), undefined);
  for (const week of WEEKS) {
    assert.equal(currentWeek(new Date(week.starts_at))?.id, week.id);
    assert.equal(currentWeek(new Date(Date.parse(week.ends_at) - 1))?.id, week.id);
    assert.notEqual(currentWeek(new Date(week.ends_at))?.id, week.id);
  }
  assert.equal((Date.parse(WEEKS[1].ends_at) - Date.parse(WEEKS[1].starts_at)) / 3600000, 169);
  assert.equal(currentWeek(new Date("2026-11-16T05:00:00Z")), undefined);
});
test("no-purchase form requires neither photos, password, subscription nor marketing consent", () => {
  const entry = { name: "A Member", email: " PERSON@example.com ", state: "DC", week: 1, ageConfirmed: true, consent: true, website: "" };
  assert.equal(validateEntry(entry).email, "person@example.com");
  assert.throws(() => validateEntry({ ...entry, ageConfirmed: false }));
  assert.throws(() => validateEntry({ ...entry, consent: false }));
  assert.throws(() => validateEntry({ ...entry, state: "PR" }));
  assert.throws(() => validateEntry({ ...entry, website: "bot" }));
  assert.throws(() => validateEntry({ ...entry, week: 5 }));
});
test("ten saved record IDs automatically qualify; nine, extra photos and opt-out do not", () => {
  const base = { id: "one-record", userId: "u", createdAt: "2026-10-19T05:00:00Z", savedAt: "2026-10-19T05:01:00Z" };
  assert.equal(savedPlantCount(Array(10).fill(base), "u", WEEKS[0]), 1);
  const records = Array.from({ length: 10 }, (_, i) => ({ ...base, id: `r${i}` }));
  assert.equal(automaticallyQualifies(records, "u", WEEKS[0], false), true);
  assert.equal(automaticallyQualifies(records.slice(0,9), "u", WEEKS[0], false), false);
  assert.equal(automaticallyQualifies(records, "u", WEEKS[0], true), false);
  assert.equal(savedPlantCount(records, "other", WEEKS[0]), 0);
  assert.equal(savedPlantCount(records.map(p => ({ ...p, savedAt: WEEKS[0].ends_at })), "u", WEEKS[0]), 0);
});
test("equal odds pool weights app and free web identically; unbiased rejection", () => {
  const entries = [{ id: "a", method: "app" as const, status: "eligible", emailKey: "a" }, { id: "b", method: "web" as const, status: "eligible", emailKey: "b" }];
  assert.equal(drawingPool(entries).length, 2);
  assert.equal(unbiasedIndex("00000000".repeat(8), 2), 0);
  assert.equal(unbiasedIndex("00000001".repeat(8), 2), 1);
  assert.equal(unbiasedIndex("ffffffff00000001" + "00000000".repeat(6), 3), 1);
  assert.throws(() => unbiasedIndex("ffffffff".repeat(8), 3));
  assert.throws(() => drawingPool([...entries, { ...entries[0], id: "c" }]));
  assert.throws(() => drawingPool([{ ...entries[0], status: "pending" }]));
  assert.notEqual(personReviewKey("Jane Doe", "PA"), personReviewKey("John Doe", "PA"));
});
test("EXIF/GPS and IPTC are removed without changing compressed image scan bytes", () => {
  const input = Uint8Array.from([255,216,255,225,0,6,71,80,83,0,255,237,0,4,1,2,255,218,0,2,8,9,255,217]);
  assert.deepEqual([...privateJpeg(input)], [255,216,255,218,0,2,8,9,255,217]);
  assert.deepEqual([...privateJpeg(Uint8Array.from([...input, 71, 80, 83]))], [255,216,255,218,0,2,8,9,255,217]);
  assert.throws(() => privateJpeg(Uint8Array.from([1, 2, 3])));
});
test("free web handler verifies bot and email, accepts without subscription, and never trusts another email identity", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-19T05:00:00Z") });
  const env: Record<string,string> = { SCOUT_CHALLENGE_ENTRIES_ENABLED: "true", NEXT_PUBLIC_SUPABASE_URL: "https://challenge-test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-only-key", SCOUT_CHALLENGE_IDENTITY_SECRET: "x".repeat(32), SCOUT_CHALLENGE_ORIGIN: "https://bcn.test", SCOUT_CHALLENGE_TURNSTILE_SECRET: "test-only", NEXT_PUBLIC_SCOUT_CHALLENGE_TURNSTILE_SITE_KEY: "test", SCOUT_CHALLENGE_SPONSOR_NAME: "BCN", SCOUT_CHALLENGE_SPONSOR_ADDRESS: "Reviewed address", SCOUT_CHALLENGE_PRIZE_ARV: "$30", SCOUT_CHALLENGE_RULES_URL: "https://bcn.test/rules", SCOUT_CHALLENGE_RETENTION_DAYS: "90", SCOUT_CHALLENGE_SEED_IDS: "seed" };
  const old = Object.fromEntries(Object.keys(env).map(key => [key,process.env[key]])); Object.assign(process.env,env);
  const calls: string[] = []; let accepted: Record<string,unknown> | null = null; let bot = true; let verifiedEmail = "person@example.com";
  t.mock.method(globalThis,"fetch",async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = String(input); calls.push(url); let result: unknown;
    if (url.includes("siteverify")) result={success:bot,hostname:"bcn.test",action:"weekly-challenge"};
    else if (url.includes("scout_challenge_config")) result={entries_enabled:true,reviewed_at:"2026-10-12T00:00:00Z",reviewed_rules_version:"bcn-scout-2026-draft-v2"};
    else if (url.includes("scout_challenge_rate")) result=true;
    else if (url.endsWith("/auth/v1/otp")) result={};
    else if (url.endsWith("/auth/v1/verify")) result={access_token:"test-token",refresh_token:"test-refresh",expires_in:3600,token_type:"bearer",user:{id:"11111111-1111-4111-8111-111111111111",email:verifiedEmail,email_confirmed_at:"2026-10-19T05:00:00Z"}};
    else if (url.endsWith("/rest/v1/rpc/scout_challenge_enter")) { accepted=JSON.parse(String(options?.body)); result=null; }
    else throw new Error(`Unexpected test request: ${url}`);
    return new Response(JSON.stringify(result),{status:200,headers:{"Content-Type":"application/json"}});
  });
  const body={name:"A Person",email:"person@example.com",state:"PA",week:1,consent:true,ageConfirmed:true,website:"",botToken:"test-token"};
  const request=(values: object)=>new Request("https://bcn.test/api/challenge",{method:"POST",headers:{Origin:"https://bcn.test","Content-Type":"application/json"},body:JSON.stringify({...body,...values})});
  try {
    assert.equal((await webEntry(request({action:"request_email"}))).verificationRequired,true);
    assert.equal(accepted,null);
    await webEntry(request({action:"submit",emailCode:"123456"}));
    assert.equal((accepted as unknown as Record<string,unknown>).p_method,"web");
    assert.equal((accepted as unknown as Record<string,unknown>).p_user,"11111111-1111-4111-8111-111111111111");
    assert.ok(calls.every(url=>!url.includes("profiles")&&!url.includes("subscription")&&!url.includes("observation")));
    verifiedEmail="other@example.com"; await assert.rejects(webEntry(request({emailCode:"123456"})),/verification failed/);
    bot=false; await assert.rejects(webEntry(request({action:"request_email"})),/Security check failed/);
    await assert.rejects(webEntry(new Request("https://bcn.test/api/challenge",{method:"POST",headers:{Origin:"https://bad.test"},body:"{}"})),/origin/);
  } finally { for(const key of Object.keys(env)) { if(old[key]===undefined) delete process.env[key]; else process.env[key]=old[key]; } }
});
test("launch fails closed and bounded uploads reject oversized bodies", async () => {
  const previous = process.env.SCOUT_CHALLENGE_ENTRIES_ENABLED; delete process.env.SCOUT_CHALLENGE_ENTRIES_ENABLED;
  try { await assert.rejects(available(), /not open/); } finally { if (previous !== undefined) process.env.SCOUT_CHALLENGE_ENTRIES_ENABLED = previous; }
  await assert.rejects(boundedBody(new Request("https://example.com", { method: "POST", body: "12345" }), 4), /too large/);
});
test("app challenge is independent of trial/paywall/subscription and does not collect GPS", async () => {
  const mobile = await readFile(new URL("../../components/WeeklyChallenge.tsx", import.meta.url), "utf8");
  const server = await readFile(new URL("../lib/challenge/server.ts", import.meta.url), "utf8");
  assert.doesNotMatch(mobile, /canAddNewRecord|canAddPhoto|Purchases|accountAccess|trialStatus|Location\./);
  assert.doesNotMatch(server, /plan_role|subscription_status|profiles|latitude|longitude/);
  assert.doesNotMatch(mobile, /launchCameraAsync|launchImageLibraryAsync|action: "submit"/);
  assert.match(mobile, /action: "preferences"/); assert.match(mobile, /Coming Soon!/);
});
