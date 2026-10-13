import { STATES } from "./core";
export const PREVIEW_NOTICE = "preview-2026-v1";
export const PREVIEW_RETENTION_DAYS = 7;
export const PREVIEW_MESSAGE = "Thank you! Your preview submission was received. The official BCN Weekly Seed Giveaway has not started. This submission is not an official contest entry.";
export type PreviewRow = { id: string; full_name: string; email: string; state: string; week: number; submitted_at: string; status: "PREVIEW ONLY" };
export function validatePreview(body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (name.length < 3 || name.length > 100 || !/\S+\s+\S+/.test(name) || /[\x00-\x1f\x7f]/.test(name)) throw new Error("Enter your first and last name (up to 100 characters).");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\x00-\x1f\x7f]/.test(email)) throw new Error("Enter a valid email address.");
  if (typeof body.state !== "string" || !(STATES as readonly string[]).includes(body.state)) throw new Error("Select your state or D.C.");
  if (![1, 2, 3, 4].includes(Number(body.week)) || !["number", "string"].includes(typeof body.week)) throw new Error("Select a giveaway week.");
  if (body.consent !== true || body.privacyVersion !== PREVIEW_NOTICE) throw new Error("Please acknowledge the preview privacy disclosure.");
  if (body.website !== "") throw new Error("Submission could not be accepted.");
  return { name, email, state: body.state, week: Number(body.week) };
}
export function previewCsv(rows: PreviewRow[]) {
  const cell = (value: unknown) => '"' + String(value).replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"';
  return "\uFEFF" + [["Name", "Email", "State", "Selected week", "Submitted (UTC)", "Status", "Email verification"], ...rows.map(r => [r.full_name, r.email, r.state, r.week, r.submitted_at, r.status, "Not required - preview only"])].map(r => r.map(cell).join(",")).join("\r\n");
}
