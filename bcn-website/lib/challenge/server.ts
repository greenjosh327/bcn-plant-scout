import { createHmac, randomUUID } from "node:crypto";
import { getSupabaseServiceClient } from "../supabase-service";
import { currentWeek, normalizedEmail, personReviewKey, RULES_VERSION, validateEntry } from "./core";

export class ChallengeError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function publicEnabled() { return process.env.SCOUT_CHALLENGE_ENTRIES_ENABLED === "true"; }
export function pageVisible() { return process.env.SCOUT_CHALLENGE_PAGE_VISIBLE !== "false"; }
export function drawingsEnabled() { return process.env.SCOUT_CHALLENGE_DRAWINGS_ENABLED === "true"; }
export function identityKey(value: string) {
  const secret = process.env.SCOUT_CHALLENGE_IDENTITY_SECRET;
  if (!secret || secret.length < 32) throw new ChallengeError("Challenge is unavailable.", 503);
  return createHmac("sha256", secret).update(value).digest("hex");
}
export async function available() {
  if (!publicEnabled()) throw new ChallengeError("The challenge is not open for entries.", 403);
  const required = ["SCOUT_CHALLENGE_IDENTITY_SECRET", "SCOUT_CHALLENGE_ORIGIN", "SCOUT_CHALLENGE_TURNSTILE_SECRET", "NEXT_PUBLIC_SCOUT_CHALLENGE_TURNSTILE_SITE_KEY", "SCOUT_CHALLENGE_SPONSOR_NAME", "SCOUT_CHALLENGE_SPONSOR_ADDRESS", "SCOUT_CHALLENGE_PRIZE_ARV", "SCOUT_CHALLENGE_RULES_URL", "SCOUT_CHALLENGE_RETENTION_DAYS", "SCOUT_CHALLENGE_SEED_IDS"];
  if (required.some(key => !process.env[key]) || !/^https:\/\//.test(process.env.SCOUT_CHALLENGE_RULES_URL ?? "")) throw new ChallengeError("Challenge launch configuration is incomplete.", 503);
  if (!/^https:\/\//.test(process.env.SCOUT_CHALLENGE_ORIGIN ?? "") || !Number.isInteger(Number(process.env.SCOUT_CHALLENGE_RETENTION_DAYS)) || Number(process.env.SCOUT_CHALLENGE_RETENTION_DAYS) < 1) throw new ChallengeError("Challenge launch configuration is incomplete.", 503);
  identityKey("readiness");
  const db = getSupabaseServiceClient();
  const { data, error } = await db.from("scout_challenge_config").select("entries_enabled,reviewed_at,reviewed_rules_version").eq("id", true).single();
  if (error || !data?.entries_enabled || !data.reviewed_at || data.reviewed_rules_version !== RULES_VERSION) throw new ChallengeError("The challenge is not open for entries.", 403);
  return db;
}
export async function challengeUser(request: Request, db: ReturnType<typeof getSupabaseServiceClient>) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) throw new ChallengeError("Sign in to use the app entry method. Free web entry needs no account.", 401);
  const { data, error } = await db.auth.getUser(header.slice(7));
  if (error || !data.user?.email || !data.user.email_confirmed_at) throw new ChallengeError("A verified account email is required for app entry.", 401);
  return data.user;
}
async function rate(db: ReturnType<typeof getSupabaseServiceClient>, key: string, limit: number) {
  const { data, error } = await db.rpc("scout_challenge_rate", { p_key: identityKey(key), p_limit: limit });
  if (error) throw new ChallengeError("Entry service is unavailable.", 503);
  if (data !== true) throw new ChallengeError("Too many attempts. Please try again later.", 429);
}
export async function boundedBody(request: Request, limit: number) {
  const reader = request.body?.getReader(); if (!reader) throw new ChallengeError("Request body required.");
  const chunks: Uint8Array[] = []; let total = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; total += value.length;
    if (total > limit) { await reader.cancel(); throw new ChallengeError("Upload is too large.", 413); } chunks.push(value); }
  return Buffer.concat(chunks);
}
export async function jsonBody(request: Request) {
  try { const body = JSON.parse((await boundedBody(request, 16384)).toString());
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(); return body as Record<string, unknown>;
  } catch (error) { if (error instanceof ChallengeError) throw error; throw new ChallengeError("Invalid entry request."); }
}
async function verifyBot(token: unknown) {
  const secret = process.env.SCOUT_CHALLENGE_TURNSTILE_SECRET;
  const origin = process.env.SCOUT_CHALLENGE_ORIGIN;
  if (!secret || !origin || typeof token !== "string" || token.length > 2048) throw new ChallengeError("Complete the security check.");
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST", body: new URLSearchParams({ secret, response: token }), signal: AbortSignal.timeout(10000)
  });
  const result = await response.json();
  if (!response.ok || result.success !== true || result.hostname !== new URL(origin).hostname || result.action !== "weekly-challenge") throw new ChallengeError("Security check failed. Please try again.");
}
export async function webEntry(request: Request) {
  const db = await available();
  if (!process.env.SCOUT_CHALLENGE_ORIGIN || request.headers.get("origin") !== process.env.SCOUT_CHALLENGE_ORIGIN) throw new ChallengeError("Entry origin is not allowed.", 403);
  // Trust proxy-derived IP only on Vercel. Other deployments need an equivalent trusted proxy adapter.
  const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown" : "unknown";
  await rate(db, `web-ip:${ip}`, 20);
  const body = await jsonBody(request);
  let entry; try { entry = validateEntry(body); } catch (error) { throw new ChallengeError((error as Error).message); }
  if (currentWeek(new Date())?.id !== entry.week) throw new ChallengeError("This contest week is not open.");
  await rate(db, `web-email:${entry.email}`, 5);
  if (body.action === "request_email") {
    await verifyBot(body.botToken);
    const { error } = await db.auth.signInWithOtp({ email: entry.email, options: { shouldCreateUser: true } });
    if (error) throw new ChallengeError("Verification email could not be sent. Please try again later.", 503);
    return { verificationRequired: true, message: "Check your email for the verification code. No app, password, payment, or subscription is required." };
  }
  if (typeof body.emailCode !== "string" || !/^[0-9]{6,8}$/.test(body.emailCode)) throw new ChallengeError("Enter the verification code sent to your email.");
  const verification = await db.auth.verifyOtp({ email: entry.email, token: body.emailCode, type: "email" });
  if (verification.error || !verification.data.user?.email || normalizedEmail(verification.data.user.email) !== entry.email) throw new ChallengeError("Email verification failed. Request a new code.");
  await insertEntry(db, entry, verification.data.user.id, "web");
  return { message: "Your weekly entry request was received. Repeat submissions count as one entry. No purchase or marketing signup is required." };
}
async function insertEntry(db: ReturnType<typeof getSupabaseServiceClient>, entry: ReturnType<typeof validateEntry>, user: string | null, method: "app" | "web") {
  const { error } = await db.rpc("scout_challenge_enter", {
    p_id: randomUUID(), p_user: user, p_week: entry.week, p_name: entry.name, p_email: entry.email,
    p_state: entry.state, p_email_key: normalizedEmail(entry.email),
    p_review_key: personReviewKey(entry.name, entry.state), p_method: method
  });
  if (error) throw new ChallengeError("Entry could not be accepted. Check the weekly deadline and photo requirements.");
}
export async function appAction(request: Request) {
  const db = await available(); const user = await challengeUser(request, db); const body = await jsonBody(request);
  const week = currentWeek(new Date()); if (!week) throw new ChallengeError("There is no open contest week.");
  await rate(db, `app-preferences:${user.id}`, 30);
  if (body.action !== "preferences" || typeof body.optedOut !== "boolean") throw new ChallengeError("Qualification is automatic. Only participation preferences can be changed.");
  let name = "", state = "";
  if (body.consent === true || body.ageConfirmed === true) {
    let details; try { details = validateEntry({ ...body, email: user.email, week: week.id, website: "" }); } catch (error) { throw new ChallengeError((error as Error).message); }
    name = details.name; state = details.state;
  }
  const { error } = await db.rpc("scout_challenge_preferences", { p_user: user.id, p_opted_out: body.optedOut, p_name: name, p_state: state, p_age: body.ageConfirmed === true, p_consent: body.consent === true });
  if (error) throw new ChallengeError("Participation preferences could not be saved.");
  return { message: body.optedOut ? "Automatic app participation is OFF. Normal app use is unchanged." : "Automatic app participation is ON. Ten saved plant records qualify automatically; no entry button is needed." };
}
