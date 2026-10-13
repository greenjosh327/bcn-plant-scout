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
  return <section id="free-entry" className="field-card mt-7 scroll-mt-4 bg-white p-4 md:mt-8 md:p-8" aria-labelledby="preview-form-title">
    <p className="text-xs font-black uppercase tracking-widest text-pine">Public preview only — no purchase necessary</p>
    <h2 id="preview-form-title" className="mt-2 text-2xl font-black text-pine md:text-3xl">Free Email Entry — No App Required</h2>
    <p className="my-3 font-bold leading-6 text-pine">We're testing the form before launch. Test submissions have no prize eligibility and will never automatically become official entries.</p>
    <p id="preview-privacy" className="text-sm leading-6 text-ink/80">We collect your name, email, state and selected week to test this form. Preview submissions are not official contest entries and are deleted according to our preview retention policy.</p>
    <details id="preview-retention" className="mb-5 mt-2 rounded-md border border-pine/15 bg-parchment/50 px-3"><summary className="cursor-pointer py-3 text-sm font-bold text-pine">Read privacy and retention details</summary><p className="pb-3 text-sm leading-6 text-ink/80">We also record submission time. No account is created, no email is sent, and you are not added to marketing lists. Test submissions are retained for 7 days, then removed by the daily cleanup (within 24 hours of expiry). To request earlier deletion, use <a className="underline" href="/contact">Contact BCN</a> and identify your submission email and week. Access is limited to authorized BCN admins. Provider backups may retain deleted data until their backup retention ends. Read the <a className="underline" href="https://scout.basecampnorthpa.com/privacy-policy">BCN Privacy Policy</a>.</p></details>
    {!enabled ? <p role="status" className="rounded-md bg-parchment p-4">Preview submissions are currently closed. Official entries and drawings are OFF.</p> : done ? <p role="status" className="rounded-md bg-sage/40 p-4 font-bold">{message}</p> : <form method="post" action="/api/challenge/preview" onSubmit={submit} aria-describedby="preview-privacy" className="grid gap-4 sm:grid-cols-2">
      <fieldset disabled={busy} className="contents">
        <label>Full name<input className="mt-2 block min-h-12 w-full rounded-md border border-pine/20 p-3 text-base" name="name" autoComplete="name" placeholder="First and last name" minLength={3} maxLength={100} required /></label>
        <label>Email address<input className="mt-2 block w-full rounded-md border border-pine/20 p-3" name="email" type="email" autoComplete="email" maxLength={254} required /></label>
        <label>State<select className="mt-2 block w-full rounded-md border border-pine/20 p-3" name="state" defaultValue="" required><option value="" disabled>Select state or D.C.</option>{STATES.map(s => <option key={s}>{s}</option>)}</select></label>
        <label>Giveaway week you are interested in<select className="mt-2 block w-full rounded-md border border-pine/20 p-3" name="week" defaultValue="1" required>{WEEKS.map(w => <option key={w.id} value={w.id}>Week {w.id}: {w.label}</option>)}</select></label>
        <div hidden aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <label className="flex min-h-12 items-start gap-3 py-2 leading-6 sm:col-span-2"><input className="mt-1 h-5 w-5 shrink-0 accent-pine" name="consent" type="checkbox" aria-describedby="preview-privacy preview-retention" required /> <span>I acknowledge the preview privacy disclosure and understand this is not an official contest entry.</span></label>
        <button type="submit" className="button button-primary min-h-12 w-full text-base sm:col-span-2" disabled={busy}>{busy ? "Working…" : "Submit Test Entry"}</button>
      </fieldset>
      <p className="sm:col-span-2 text-sm text-ink/65">No email verification, download, payment, subscription or photos required. An automatic browser security check helps limit spam.</p>
      <noscript>Enable JavaScript to complete the automatic security check and submit this test form.</noscript>
      <p role="status" aria-live="polite" className="sm:col-span-2">{message}</p>
    </form>}
  </section>;
}
