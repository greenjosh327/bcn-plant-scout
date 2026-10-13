import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getSupabaseServiceClient } from "../supabase-service";
import { ChallengeError, jsonBody } from "./server";
import { PREVIEW_MESSAGE, PREVIEW_NOTICE, PREVIEW_RETENTION_DAYS, validatePreview } from "./preview";
export const PREVIEW_ORIGIN = "https://basecampnorthpa.com";
function hash(value: string) {
  const secret = process.env.SCOUT_PREVIEW_SECRET;
  if (!secret || secret.length < 32) throw new ChallengeError("Preview security configuration is unavailable.", 503);
  return createHmac("sha256", secret).update(value).digest("hex");
}
function ipKey(request: Request) {
  const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-real-ip") : "local-test";
  if (!ip) throw new ChallengeError("Preview security check is unavailable.", 503);
  return hash(`preview-ip:${ip}`);
}
export async function previewReady() {
  if (process.env.SCOUT_PREVIEW_ENABLED !== "true") throw new ChallengeError("Public preview submissions are currently closed.", 403);
  hash("readiness");
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32) throw new ChallengeError("Preview retention configuration is unavailable.", 503);
  const db = getSupabaseServiceClient();
  const { data, error } = await db.from("scout_preview_config").select("enabled,retention_days,privacy_version,reviewed_at,cleanup_verified_at").eq("id", true).single();
  if (error || !data?.enabled || !data.reviewed_at || !data.cleanup_verified_at || data.retention_days !== PREVIEW_RETENTION_DAYS || data.privacy_version !== PREVIEW_NOTICE) throw new ChallengeError("Public preview submissions are currently closed.", 403);
  return db;
}
async function rate(db: ReturnType<typeof getSupabaseServiceClient>, key: string, limit: number, seconds = 3600) {
  const result = await db.rpc("scout_preview_rate", { p_key: hash(key), p_limit: limit, p_seconds: seconds });
  if (result.error) throw new ChallengeError("Preview service is unavailable.", 503);
  if (result.data !== true) throw new ChallengeError("Too many attempts. Please try again later.", 429);
}
export async function previewChallenge(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new ChallengeError("Open the form on the BCN website.", 403);
  const db = await previewReady(); const ip = ipKey(request);
  await rate(db, "preview-issue-global", 500); await rate(db, `preview-issue:${ip}`, 30);
  const now = Date.now();
  const payload = Buffer.from(JSON.stringify({ ip, issued: now, expires: now + 300000, nonce: randomUUID() })).toString("base64url");
  const challenge = `${payload}.${hash(`preview-proof:${payload}`)}`;
  return { challenge, difficulty: 16, previewOnly: true };
}
export function verifyPreviewProof(challenge: unknown, counter: unknown, ip: string, now = Date.now()) {
  if (typeof challenge !== "string" || challenge.length > 1024 || !Number.isInteger(counter) || Number(counter) < 0 || Number(counter) > 2000000) throw new ChallengeError("Please retry the security check.");
  const parts = challenge.split(".");
  if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[1])) throw new ChallengeError("Please retry the security check.");
  const expected = hash(`preview-proof:${parts[0]}`);
  if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(parts[1], "hex"))) throw new ChallengeError("Please retry the security check.");
  let payload; try { payload = JSON.parse(Buffer.from(parts[0], "base64url").toString()); } catch { throw new ChallengeError("Please retry the security check."); }
  if (payload.ip !== ip || !Number.isFinite(payload.issued) || !Number.isFinite(payload.expires) || now - payload.issued < 1500 || payload.expires <= now || payload.expires - payload.issued !== 300000 || !createHash("sha256").update(`${challenge}:${counter}`).digest("hex").startsWith("0000")) throw new ChallengeError("Security check expired or failed. Please retry.");
  return hash(`preview-used:${challenge}`);
}
export async function submitPreview(request: Request) {
  if (request.headers.get("origin") !== PREVIEW_ORIGIN) throw new ChallengeError("Open the form on the BCN website.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ChallengeError("Invalid submission format.", 415);
  const db = await previewReady(); const ip = ipKey(request);
  await rate(db, "preview-submit-global", 200); await rate(db, `preview-submit:${ip}`, 10);
  const body = await jsonBody(request);
  let entry; try { entry = validatePreview(body); } catch (error) { throw new ChallengeError((error as Error).message); }
  await rate(db, `preview-email:${entry.email}`, 3, 86400);
  const proof = verifyPreviewProof(body.challenge, body.counter, ip);
  const result = await db.rpc("scout_preview_submit", { p_name: entry.name, p_email: entry.email, p_state: entry.state, p_week: entry.week, p_privacy: PREVIEW_NOTICE, p_proof: proof });
  if (result.error) throw new ChallengeError("Submission could not be accepted. Please retry the security check.", 409);
  return { message: PREVIEW_MESSAGE, previewOnly: true };
}
