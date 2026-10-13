"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { completeAdminSessionHandoff, supabase } from "@/lib/supabase-browser";
import { currentWeek, WEEKS } from "@/lib/challenge/core";
import type { GiveawayReport, Participant, WeeklyCounters } from "@/lib/challenge/reporting";
type Entry = { id: string; user_id: string | null; full_name: string; email: string; state: string; status: string; method: string; submitted_at: string; review_reason: string | null };
type Drawing = { id: string; winner_entry_id: string; drawn_at: string; eligible_entry_ids: string[]; selected_index: number; entropy: string; algorithm: string };
type Fulfillment = { drawing_id: string; notification_status: string; fulfillment_status: string; seed_product_ids: string[]; tracking_reference: string | null };
type Data = { report: Omit<GiveawayReport, "weeks">; participants: Participant[]; counters: WeeklyCounters; summaryText: string; canDraw: boolean; entries: Entry[]; migrationPending?: boolean; drawings: Drawing[]; fulfillment: Fulfillment[]; config: { page_visible: boolean; entries_enabled: boolean; drawings_enabled: boolean; reviewed_at: string | null }; seeds: { id: string; name: string; inventory: number }[]; selectedSeeds?: { id: string; name: string }[]; audit: { id: number; action: string; created_at: string; details: unknown }[] };
const dateET = (date: string | null) => date ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }).format(new Date(date)) + " ET" : "—";
const eligibilityLabel = (p: Participant) => p.eligibility === "qualified" ? p.official ? "Qualified" : "Qualified threshold (preview)" : p.eligibility === "opted_out" ? "Opted Out" : "Not Qualified";
export function AdminChallenge() {
  const [week, setWeek] = useState<number>(() => currentWeek(new Date())?.id ?? 1); const [token, setToken] = useState(""); const [data, setData] = useState<Data | null>(null);
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const [eligibility, setEligibility] = useState("all"); const [method, setMethod] = useState("all");
  const generation = useRef(0);
  const sessionToken = useRef("");
  useEffect(() => { let active = true;
    const updateSession = (next: string) => { if (active && sessionToken.current !== next) { sessionToken.current = next; generation.current++; setData(null); setToken(next); } };
    void (async () => { await completeAdminSessionHandoff(); const session = await supabase?.auth.getSession(); updateSession(session?.data.session?.access_token ?? ""); })();
    const listener = supabase?.auth.onAuthStateChange((_event, session) => updateSession(session?.access_token ?? ""));
    return () => { active = false; listener?.data.subscription.unsubscribe(); }; }, []);
  const load = useCallback(async () => { const current = ++generation.current; if (!token) return; try { const response = await fetch(`/api/admin/challenge?week=${week}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const result = await response.json(); if (!response.ok) throw new Error(result.error); if (current === generation.current) setData(result);
  } catch (error) { if (current === generation.current) { setData(null); setMessage((error as Error).message); } } }, [token, week]);
  useEffect(() => { setData(null); void load(); return () => { generation.current++; }; }, [load]);
  useEffect(() => { if (!token) return; const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60000); return () => clearInterval(timer); }, [load, token]);
  async function downloadReport() {
    if (busy) return; setBusy(true);
    try {
      const response = await fetch(`/api/admin/challenge?week=${week}&format=csv`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!response.ok) { const error = await response.json(); throw new Error(error.error); }
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = `bcn-giveaway-week-${week}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage("Weekly report downloaded. It includes all participants for the selected week, independent of table filters.");
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function action(payload: Record<string, unknown>) {
    if (busy) return; setBusy(true); setMessage("");
    try { const response = await fetch("/api/admin/challenge", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error); setMessage(result.message); await load();
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <main className="container py-12"><h1 className="text-4xl font-black text-pine">Weekly Seed Giveaway administration</h1>
    <p className="my-4"><a className="underline" href="/admin">Shop admin / sign in</a></p>
    {!token ? <p>Sign in through the existing BCN admin page, then return here.</p> : <>
      <label>Contest week <select value={week} onChange={e => setWeek(Number(e.target.value))}>{WEEKS.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}</select></label>
      <button className="button button-secondary ml-4" onClick={() => void load()}>Refresh</button>
      <button className="button button-secondary ml-4" disabled={busy || !data} onClick={() => void downloadReport()}>Download Weekly Report</button>
      <p role="status" className="my-4">{message}</p>

      {data ? <>
        <p>Public page: {data.config.page_visible ? "ON" : "OFF"}. Entries: {data.config.entries_enabled ? "ON" : "OFF"}. Drawings: {data.config.drawings_enabled ? "ON" : "OFF"}.</p>
        {data.migrationPending ? <p className="my-4 rounded-md bg-parchment p-4">Contest schema is not deployed. Real record counts are read-only previews; official free entries, opt-out preferences, eligible participants and winners are unavailable. No entries or drawings are created by viewing this dashboard.</p> : null}
        <p className="my-3 text-sm">Weekly active means an account with at least one new saved plant record, not a sign-in count. Repeated species count; photos and edits do not. Counts refresh every minute while this page is visible.</p>
        {data.report.timestampBasis === "legacy_preview" ? <p className="text-sm font-bold">Preview uses existing client-created timestamps. Immutable server save times require the reviewed contest migration before official qualification.</p> : null}
        <div className="my-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([["Weekly active Plant Scout users", data.counters.activeUsers], ["Users with 10+ new records", data.counters.usersWithTen], ["Users with 1–9 records", data.counters.usersWithOneToNine], ["Verified free email entries", data.counters.freeEntries], ["Official eligible drawing participants", data.counters.eligibleParticipants], ["New plant records this week", data.counters.newRecords], ["Winners selected", data.counters.winners]] as const).map(([label, value]) => <div key={label} className="field-card p-4"><p className="text-sm font-bold text-stone">{label}</p><p className="mt-2 text-2xl font-black text-pine">{value ?? "Unavailable"}</p></div>)}
        </div>
        <p>One ticket per eligible person, with equal odds for both methods. No different-species or photo-review requirement.</p>
        <section className="field-card my-6 p-5"><h2 className="text-2xl font-black text-pine">Participants</h2>
          <div className="my-4 flex flex-wrap gap-4"><label>Eligibility <select value={eligibility} onChange={e => setEligibility(e.target.value)}><option value="all">All</option><option value="qualified">Qualified</option><option value="not_qualified">Not Qualified</option><option value="opted_out">Opted Out</option></select></label><label>Entry method <select value={method} onChange={e => setMethod(e.target.value)}><option value="all">All</option><option value="app">Plant Scout</option><option value="web">Free Email Entry</option></select></label></div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Account", "New records", "Method", "Eligibility", "Date qualified (ET)", "Winner"].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{data.participants.filter(p => (eligibility === "all" || p.eligibility === eligibility) && (method === "all" || p.method === method)).map(p => <tr key={p.identifier} className="border-t border-pine/10"><td className="p-3 break-all">{p.label}</td><td className="p-3">{p.savedPlants}</td><td className="p-3">{p.method === "app" ? "Plant Scout" : "Free Email Entry"}</td><td className="p-3">{eligibilityLabel(p)}<p className="mt-1 text-xs text-stone">{p.detail}</p></td><td className="p-3">{dateET(p.qualificationDate)}</td><td className="p-3">{p.winner ? "Winner" : "Not selected"}</td></tr>)}</tbody></table></div>
          {!data.participants.length ? <p className="mt-4">No saved records or official entries in this week.</p> : null}
          <p className="mt-3 text-xs text-stone">Qualification date is the tenth record's save time for app progress or the accepted entry time for free entry. Preview rows are not official tickets.</p>
        </section>
        <details className="my-6 field-card p-5"><summary className="font-bold">Summary for authorized reporting / ChatGPT</summary><pre className="mt-4 whitespace-pre-wrap text-sm">{data.summaryText}</pre></details>
        {data.entries.length ? <h2 className="mt-8 text-2xl font-black text-pine">Official entry eligibility review</h2> : null}
        {data.entries.map(entry => <details key={entry.id} className="field-card my-6 p-6"><summary className="font-bold">{entry.email} · {entry.status}</summary>
          <h2 className="text-xl font-bold">{entry.full_name} — {entry.email}</h2>
          <p>{entry.state} · {entry.method} · {entry.status} · Submitted {entry.submitted_at}</p><p>{entry.review_reason}</p>
          <p>New plant records saved: {data.participants.find(p => p.entryId === entry.id)?.savedPlants ?? 0}.</p>
          <form method="post" className="mt-4 flex flex-wrap gap-3" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void action({ action: "review_entry", id: entry.id, status: f.get("status"), reason: f.get("reason") }); }}>
            <label>Eligibility <select name="status" defaultValue={entry.status}>{["pending", "eligible", "duplicate", "ineligible", "withdrawn"].map(s => <option key={s}>{s}</option>)}</select></label>
            <label>Decision reason <input name="reason" required minLength={5} maxLength={1000} /></label>
            <button className="button button-secondary" disabled={busy}>Record eligibility decision</button>
          </form>
          <p className="mt-2 text-sm">Similar names/state are a review signal only. Confirm identity before excluding duplicates; shared addresses, devices, or households alone do not disqualify anyone.</p>
        </details>)}
        <section className="field-card p-6"><h2 className="text-2xl font-bold">Immutable weekly drawing</h2>
          {data.drawings.length ? data.drawings.map(d => { const winner = data.entries.find(e => e.id === d.winner_entry_id); const f = data.fulfillment.find(v => v.drawing_id === d.id); return <div key={d.id}>
            <p>Winner: {winner?.full_name} ({winner?.email}). Drawn {dateET(d.drawn_at)}. Pool size {d.eligible_entry_ids.length}. Algorithm {d.algorithm}, index {d.selected_index}.</p>
            <p>Contact: {f?.notification_status ?? "pending"}. Fulfillment: {f?.fulfillment_status ?? "pending"}. Selected seed packs: {f?.seed_product_ids.map(id => data.selectedSeeds?.find(s => s.id === id)?.name ?? data.seeds.find(s => s.id === id)?.name ?? id).join(", ") || "Not selected"}.</p>
            <details><summary>Reproducible audit snapshot</summary><pre className="overflow-auto">{JSON.stringify(d, null, 2)}</pre></details>
            <p><a className="underline" href={`mailto:${encodeURIComponent(winner?.email ?? "")}?subject=${encodeURIComponent("BCN Plant Scout Weekly Challenge winner")}&body=${encodeURIComponent("You were selected in the BCN Plant Scout Weekly Challenge. Your prize is three eligible in-stock seed packs with standard domestic shipping included. No payment is required. Please reply so BCN can verify eligibility and arrange your prize under the official rules.")}`}>Prepare winner notification in your email app</a></p>
            <form method="post" className="my-4 grid gap-3" onSubmit={e => { e.preventDefault(); const fields = new FormData(e.currentTarget); void action({ action: "fulfillment", id: d.id, notification: fields.get("notification"), status: fields.get("status"), products: fields.getAll("products").filter(Boolean), tracking: fields.get("tracking") }); }}>
              <label>Notification <select name="notification" defaultValue={f?.notification_status}>{["pending", "notified", "responded"].map(s => <option key={s}>{s}</option>)}</select></label>
              <label>Fulfillment <select name="status" defaultValue={f?.fulfillment_status}>{["pending", "packed", "shipped", "delivered"].map(s => <option key={s}>{s}</option>)}</select></label>
              {[0, 1, 2].map(i => <label key={i}>Seed pack {i + 1}<select name="products" defaultValue={f?.seed_product_ids[i] ?? ""}><option value="">Select reviewed eligible seed</option>{data.seeds.map(s => <option key={s.id} value={s.id}>{s.name} ({s.inventory} in stock)</option>)}</select></label>)}
              <label>Tracking reference <input name="tracking" maxLength={100} defaultValue={f?.tracking_reference ?? ""} /></label>
              <p>Reserve physical packs through the existing inventory workflow. Winner pays $0 shipping. Collect shipping details privately after eligibility verification; do not put addresses in review reasons.</p>
              <button className="button button-secondary" disabled={busy}>Save notification / fulfillment status</button>
            </form>
          </div>; }) : <form method="post" className="mt-4 grid gap-3" onSubmit={e => { e.preventDefault(); void action({ action: "draw", week, confirmation: new FormData(e.currentTarget).get("confirmation") }); }}>
            <p>Resolve all pending entries and confirm the full participant list first. Drawing is blocked until the scheduled Monday and until both drawing controls are enabled. It cannot be rerun or edited.</p>
            <label>Type DRAW WEEK {week} to confirm<input name="confirmation" required autoComplete="off" /></label><button className="button button-primary" disabled={busy || !data.canDraw}>Draw Winner</button>
          </form>}
        </section>
        <details className="mt-6"><summary>Most recent 100 append-only audit records</summary><pre className="overflow-auto">{JSON.stringify(data.audit, null, 2)}</pre></details>
      </> : null}
    </>}
  </main>;
}
