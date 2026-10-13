"use client";
import Script from "next/script";
import { useRef, useState } from "react";
import { STATES, WEEKS } from "@/lib/challenge/core";
type Turnstile = { render: (element: HTMLElement, options: Record<string, unknown>) => string; reset: (id: string) => void };
declare global { interface Window { turnstile?: Turnstile } }
export function ChallengeEntryForm({ week, siteKey, preview = false }: { week: number; siteKey: string; preview?: boolean }) {
  const widget = useRef<HTMLDivElement>(null); const widgetId = useRef<string | undefined>(undefined);
  const [token, setToken] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const [verification, setVerification] = useState(false);
  function renderCheck() {
    if (widget.current && window.turnstile && !widgetId.current) widgetId.current = window.turnstile.render(widget.current, {
      sitekey: siteKey, action: "weekly-challenge", callback: (value: string) => setToken(value), "expired-callback": () => setToken(""), "error-callback": () => setToken("")
    });
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (preview || busy || done) return; setBusy(true); setMessage("");
    const fields = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        name: fields.get("name"), email: fields.get("email"), state: fields.get("state"), week: fields.get("week"),
        consent: fields.get("consent") === "on", ageConfirmed: fields.get("ageConfirmed") === "on", website: fields.get("website") ?? "", botToken: token,
        action: verification ? "submit" : "request_email", emailCode: fields.get("emailCode")
      }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setMessage(result.message); if (result.verificationRequired) { setVerification(true); setToken(""); } else setDone(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); setToken(""); if (widgetId.current) window.turnstile?.reset(widgetId.current); }
    finally { setBusy(false); }
  }
  if (preview) return <section id="free-entry" className="field-card mt-8 bg-white p-6 md:p-8" aria-labelledby="free-entry-title">
    <p className="text-xs font-black uppercase tracking-widest text-rust">No purchase necessary</p>
    <h2 id="free-entry-title" className="mt-2 text-3xl font-black text-pine">Free email entry</h2>
    <p className="my-4 text-ink/75">Prefer to enter without the app? This free form will give you the same chance to win. No download, photos, payment, or subscription required.</p>
    <p id="preview-explanation" className="mb-6 rounded-md bg-parchment p-4 font-bold text-pine">Preview only — entries will open when the contest begins. This form is disabled and collects no information.</p>
    <fieldset disabled aria-describedby="preview-explanation" className="grid gap-4 sm:grid-cols-2">
      <label>Full name<input className="mt-2 block w-full rounded-md border border-pine/20 bg-sage/30 p-3" placeholder="Your name" /></label>
      <label>Email<input className="mt-2 block w-full rounded-md border border-pine/20 bg-sage/30 p-3" type="email" placeholder="you@example.com" /></label>
      <label>State<select className="mt-2 block w-full rounded-md border border-pine/20 bg-sage/30 p-3" defaultValue=""><option value="">Select state or D.C.</option>{STATES.map(s => <option key={s}>{s}</option>)}</select></label>
      <label>Contest week<select className="mt-2 block w-full rounded-md border border-pine/20 bg-sage/30 p-3" defaultValue="1">{WEEKS.map(w => <option key={w.id} value={w.id}>Week {w.id}: {w.label}</option>)}</select></label>
      <label className="sm:col-span-2"><input type="checkbox" /> I confirm age 18+, U.S./D.C. residency, and acknowledge the rules and privacy notice.</label>
      <button className="button button-secondary sm:col-span-2" type="button" disabled>Entries Not Yet Open</button>
    </fieldset><p className="mt-4 text-sm text-ink/65">Email verification will be required when entries open. Entry never automatically subscribes you to marketing.</p>
  </section>;
  return <section id="free-entry" className="field-card mt-8 p-6" aria-labelledby="free-entry-title">
    <h2 id="free-entry-title" className="text-2xl font-black">Free web entry</h2>
    <p className="my-4">No app download, payment, subscription, or photos are required. Both methods have equal odds. One entry per person per week across both methods.</p>
    {done ? <p role="status">{message}</p> : <form method="post" action="/api/challenge" onSubmit={submit} className="grid max-w-xl gap-4">
      <label>Full name<input className="input block w-full" name="name" autoComplete="name" minLength={2} maxLength={100} required /></label>
      <label>Email<input className="input block w-full" name="email" type="email" autoComplete="email" maxLength={254} readOnly={verification} required /></label>
      <label>State<select className="input block w-full" name="state" required defaultValue=""><option value="" disabled>Select state or D.C.</option>{STATES.map(s => <option key={s}>{s}</option>)}</select></label>
      <label>Contest week<select className="input block w-full" name="week" defaultValue={week}>{WEEKS.map(w => <option key={w.id} value={w.id} disabled={w.id !== week}>Week {w.id}: {w.label}</option>)}</select></label>
      <div hidden aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label><input type="checkbox" name="ageConfirmed" required /> I am 18 or older and reside in one of the 50 U.S. states or D.C.</label>
      <label><input type="checkbox" name="consent" required /> I agree to the <a className="underline" href="#rules">rules</a> and acknowledge the <a className="underline" href="#privacy">contest privacy notice</a>.</label>
      <p className="text-sm">Your information is used to administer the drawing and contact winners. This does not subscribe you to marketing.</p>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={renderCheck} />
      <div ref={widget} aria-label="Security check" />
      {verification ? <label>Email verification code<input className="input block w-full" name="emailCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" required /></label> : null}
      <button className="button button-primary" disabled={busy || (!verification && !token)}>{busy ? "Working…" : verification ? "Verify email and submit free entry" : "Send verification code"}</button>
      {verification ? <button type="button" className="button button-secondary" onClick={() => { setVerification(false); setToken(""); if (widgetId.current) window.turnstile?.reset(widgetId.current); }}>Request a new code</button> : null}
      <p role="status">{message}</p>
    </form>}
  </section>;
}
