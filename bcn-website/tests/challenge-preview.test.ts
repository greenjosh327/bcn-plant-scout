import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PREVIEW_MESSAGE, PREVIEW_NOTICE, previewCsv, validatePreview } from "../lib/challenge/preview";
import { previewChallenge, submitPreview, verifyPreviewProof } from "../lib/challenge/preview-server";
import { GET as adminGet } from "../app/api/admin/challenge/route";
const valid = { name: "Test Visitor", email: " TEST@example.invalid ", state: "PA", week: 4, consent: true, privacyVersion: PREVIEW_NOTICE, website: "" };
test("preview validates identity, selected future week, privacy and honeypot without accounts or purchases", () => {
  assert.deepEqual(validatePreview(valid), { name: "Test Visitor", email: "test@example.invalid", state: "PA", week: 4 });
  for (const bad of [{ name: "Single" }, { email: "bad" }, { email: "a\u0000@b.c" }, { state: "PR" }, { week: 5 }, { week: true }, { consent: false }, { privacyVersion: "old" }, { website: "bot" }]) assert.throws(() => validatePreview({ ...valid, ...bad }));
});
test("preview CSV is explicitly test-only, unverified and spreadsheet-safe", () => {
  const csv = previewCsv([{ id: "test", full_name: "=formula Name", email: "+email@example.invalid", state: "PA", week: 1, submitted_at: "2026-10-12T00:00:00Z", status: "PREVIEW ONLY" }]);
  assert.match(csv, /"'=formula Name"/); assert.match(csv, /"'\+email/); assert.match(csv, /PREVIEW ONLY/); assert.match(csv, /Not required - preview only/);
});
test("preview handler fails closed, checks origin/rates/proof and only calls isolated submission RPC", async t => {
  const env = { SCOUT_PREVIEW_ENABLED: "true", SCOUT_PREVIEW_SECRET: "test-secret-".repeat(4), CRON_SECRET: "test-cron-".repeat(4), NEXT_PUBLIC_SUPABASE_URL: "https://preview-test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-only-key", VERCEL: "0" };
  const old = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]])); Object.assign(process.env, env);
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-12T10:00:00Z") });
  const calls: string[] = []; let allowed = true; let ready = true; let inserted: Record<string, unknown> | null = null;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push(url); let data: unknown;
    if (url.includes("scout_preview_config")) data = { enabled: ready, retention_days: 7, privacy_version: PREVIEW_NOTICE, reviewed_at: "now", cleanup_verified_at: "now" };
    else if (url.includes("scout_preview_rate")) data = allowed;
    else if (url.includes("scout_preview_submit")) { inserted = JSON.parse(String(init?.body)); data = null; }
    else throw new Error(`Unexpected preview request: ${url}`);
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  });
  const request = (body: object, origin = "https://basecampnorthpa.com") => new Request("https://basecampnorthpa.com/api/challenge/preview", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    process.env.SCOUT_PREVIEW_ENABLED = "false"; await assert.rejects(previewChallenge(new Request("https://basecampnorthpa.com/api/challenge/preview")), /closed/); assert.equal(calls.length, 0); process.env.SCOUT_PREVIEW_ENABLED = "true";
    ready = false; await assert.rejects(previewChallenge(new Request("https://basecampnorthpa.com/api/challenge/preview")), /closed/); ready = true;
    const proof = await previewChallenge(new Request("https://basecampnorthpa.com/api/challenge/preview"));
    let counter = 0; while (!createHash("sha256").update(`${proof.challenge}:${counter}`).digest("hex").startsWith("0000")) counter++;
    const payload = { ...valid, challenge: proof.challenge, counter };
    await assert.rejects(submitPreview(request(payload, "https://attacker.invalid")), /BCN/);
    await assert.rejects(submitPreview(request(payload)), /Security check/); t.mock.timers.tick(2000);
    assert.throws(() => verifyPreviewProof(proof.challenge, counter, "another-ip"));
    assert.throws(() => verifyPreviewProof(proof.challenge + "a", counter, "local"));
    assert.throws(() => verifyPreviewProof(proof.challenge, -1, "local"));
    const result = await submitPreview(request(payload)); assert.equal(result.message, PREVIEW_MESSAGE); assert.equal(result.previewOnly, true);
    assert.equal((inserted as unknown as Record<string, unknown>).p_email, "test@example.invalid");
    assert.ok(calls.every(c => c.includes("scout_preview"))); // No Auth, official entries, marketing, plants or billing.
    allowed = false; await assert.rejects(submitPreview(request(payload)), /Too many/); allowed = true;
    t.mock.timers.tick(300000); await assert.rejects(submitPreview(request(payload)), /expired/);
    assert.equal((await adminGet(new Request("https://basecampnorthpa.com/api/admin/challenge?mode=preview"))).status, 401);
  } finally { for (const [key,value] of Object.entries(old)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
test("isolated PostgreSQL preview migration denies public CRUD/RPC, enforces duplicates/replay/gates and purges only test data", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create table public.profiles(id integer); insert into profiles values(1); create table public.scout_challenge_entries(id integer); insert into scout_challenge_entries values(1);");
    const sql = await readFile(new URL("../supabase/migrations/20261013021123_bcn_weekly_preview_submissions.sql", import.meta.url), "utf8"); await db.exec(sql);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      for (const command of ["select * from scout_preview_submissions", "insert into scout_preview_submissions(full_name,email,state,week,privacy_version) values('Test Visitor','test@example.invalid','PA',1,'preview-2026-v1')", "update scout_preview_submissions set status='official'", "delete from scout_preview_submissions", "select * from scout_preview_config", "select scout_preview_rate(repeat('a',64),10,3600)", "select scout_preview_submit('Test Visitor','test@example.invalid','PA',1,'preview-2026-v1',repeat('a',64))", "select scout_preview_purge()"])
        await assert.rejects(db.exec(command), /permission denied/);
      await db.exec("reset role");
    }
    await db.exec("set role service_role"); await assert.rejects(db.exec("update scout_preview_config set enabled=true"), /permission denied/);
    const submit = (proof: string, name = "Test Visitor", email = "test@example.invalid", week = 1) => db.query("select scout_preview_submit($1,$2,'PA',$3,'preview-2026-v1',$4)", [name,email,week,proof.repeat(64)]);
    await assert.rejects(submit("a"), /closed/);
    await db.exec("reset role; update scout_preview_config set enabled=true,reviewed_at=now(),cleanup_verified_at=now(); set role service_role");
    await submit("a"); await submit("b"); // Same email/week succeeds without duplicating or revealing existence.
    assert.equal((await db.query<{n:number}>("select count(*)::int n from scout_preview_submissions")).rows[0].n, 1);
    await assert.rejects(submit("a"), /duplicate key/); await assert.rejects(submit("c", "Single"), /Invalid/);
    await submit("d", "Another Visitor", "different@example.invalid"); await submit("e", "Test Visitor", "test@example.invalid", 2);
    const rows = (await db.query<{status:string;submitted_at:string}>("select status,submitted_at from scout_preview_submissions")).rows; assert.ok(rows.every(r => r.status === "PREVIEW ONLY" && r.submitted_at));
    await assert.rejects(db.exec("update scout_preview_submissions set status='official'"), /permission denied/);
    const rate = () => db.query<{ok:boolean}>("select scout_preview_rate(repeat('f',64),2,3600) ok"); assert.equal((await rate()).rows[0].ok, true); assert.equal((await rate()).rows[0].ok, true); assert.equal((await rate()).rows[0].ok, false);
    await db.exec("reset role; update scout_preview_submissions set expires_at=now()-interval '1 minute'; set role service_role");
    assert.equal((await db.query<{n:number}>("select scout_preview_purge() n")).rows[0].n, 3);
    await db.exec("reset role"); assert.equal((await db.query<{n:number}>("select count(*)::int n from profiles")).rows[0].n,1); assert.equal((await db.query<{n:number}>("select count(*)::int n from scout_challenge_entries")).rows[0].n,1);
  } finally { await db.close(); }
});
