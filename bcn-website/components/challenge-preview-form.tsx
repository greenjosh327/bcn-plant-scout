"use client";
import { useEffect, useRef, useState } from "react";
import { STATES, WEEKS } from "@/lib/challenge/core";
import { PREVIEW_MESSAGE, PREVIEW_NOTICE } from "@/lib/challenge/preview";
export function ChallengePreviewForm({ enabled }: { enabled: boolean }) {
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [message, setMessage] = useState("");
  const workerRef = useRef<Worker | null>(null);
  useEffect(() => () => workerRef.current?.terminate(), []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || done || !enabled) return;
    const form = new FormData(event.currentTarget); setBusy(true); setMessage("Preparing the security check…");
    try {
      const response = await fetch("/api/challenge/preview", { cache: "no-store" }); const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const issued = Date.now();
      const counter = await new Promise<number>((resolve, reject) => {
        const worker = new Worker("/preview-proof-worker.js"); workerRef.current = worker;
        const timer = setTimeout(() => { worker.terminate(); reject(new Error("Security check took too long. Please try again.")); }, 60000);
        const finish = () => { clearTimeout(timer); worker.terminate(); workerRef.current = null; };
        worker.onmessage = ({ data }) => { finish(); if (data.error) reject(new Error("Security check failed. Please try again.")); else resolve(data.counter); };
        worker.onerror = () => { finish(); reject(new Error("Your browser could not complete the security check. Please try an updated browser.")); };
        worker.postMessage(result);
      });
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 1600 - (Date.now() - issued))));
      setMessage("Submitting your preview…");
      const saved = await fetch("/api/challenge/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), email: form.get("email"), state: form.get("state"), week: form.get("week"), consent: form.get("consent") === "on", privacyVersion: PREVIEW_NOTICE, website: form.get("website") ?? "", challenge: result.challenge, counter }) });
      const body = await saved.json(); if (!saved.ok) throw new Error(body.error);
      setDone(true); setMessage(PREVIEW_MESSAGE);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Submission failed. Please try again."); }
    finally { setBusy(false); }
  }
  return <section id="free-entry" className="field-card mt-8 bg-white p-6 md:p-8" aria-labelledby="preview-form-title">
    <p className="text-xs font-black uppercase tracking-widest text-rust">Public preview only — no purchase necessary</p>
    <h2 id="preview-form-title" className="mt-2 text-3xl font-black text-pine">Test the email submission form</h2>
    <p className="my-4 font-bold text-pine">This is a test, not an official contest entry. There is no prize eligibility. Preview submissions will never automatically become official entries.</p>
    <p id="preview-privacy" className="mb-5 text-sm leading-6 text-ink/75">We collect your name, email, state, selected week and submission time only to test this form. No account is created, no email is sent, and you are not added to marketing lists. Test submissions are retained for 7 days, then removed by the daily cleanup (within 24 hours of expiry). To request earlier deletion, use <a className="underline" href="/contact">Contact BCN</a> and identify your submission email and week. Access is limited to authorized BCN admins. Provider backups may retain deleted data until their backup retention ends. Read the <a className="underline" href="https://scout.basecampnorthpa.com/privacy-policy">BCN Privacy Policy</a>.</p>
    {!enabled ? <p role="status" className="rounded-md bg-parchment p-4">Preview submissions are currently closed. Official entries and drawings are OFF.</p> : done ? <p role="status" className="rounded-md bg-sage/40 p-4 font-bold">{message}</p> : <form method="post" action="/api/challenge/preview" onSubmit={submit} aria-describedby="preview-privacy" className="grid gap-4 sm:grid-cols-2">
      <fieldset disabled={busy} className="contents">
        <label>First and last name<input className="mt-2 block w-full rounded-md border border-pine/20 p-3" name="name" autoComplete="name" minLength={3} maxLength={100} required /></label>
        <label>Email address<input className="mt-2 block w-full rounded-md border border-pine/20 p-3" name="email" type="email" autoComplete="email" maxLength={254} required /></label>
        <label>State<select className="mt-2 block w-full rounded-md border border-pine/20 p-3" name="state" defaultValue="" required><option value="" disabled>Select state or D.C.</option>{STATES.map(s => <option key={s}>{s}</option>)}</select></label>
        <label>Giveaway week you are interested in<select className="mt-2 block w-full rounded-md border border-pine/20 p-3" name="week" defaultValue="1" required>{WEEKS.map(w => <option key={w.id} value={w.id}>Week {w.id}: {w.label}</option>)}</select></label>
        <div hidden aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <label className="sm:col-span-2"><input name="consent" type="checkbox" required /> I acknowledge the preview privacy disclosure and understand this is not an official contest entry.</label>
        <button type="submit" className="button button-primary sm:col-span-2" disabled={busy}>{busy ? "Working…" : "Submit"}</button>
      </fieldset>
      <p className="sm:col-span-2 text-sm text-ink/65">No email verification, download, payment, subscription or photos required. An automatic browser security check helps limit spam.</p>
      <noscript>Enable JavaScript to complete the automatic security check and submit this test form.</noscript>
      <p role="status" aria-live="polite" className="sm:col-span-2">{message}</p>
    </form>}
  </section>;
}
