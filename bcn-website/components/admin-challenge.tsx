"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { completeAdminSessionHandoff, supabase } from "@/lib/supabase-browser";
import { currentWeek, WEEKS } from "@/lib/challenge/core";
type Entry = { id: string; user_id: string | null; full_name: string; email: string; state: string; status: string; method: string; submitted_at: string; review_reason: string | null };
type Drawing = { id: string; winner_entry_id: string; drawn_at: string; eligible_entry_ids: string[]; selected_index: number; entropy: string; algorithm: string };
type Fulfillment = { drawing_id: string; notification_status: string; fulfillment_status: string; seed_product_ids: string[]; tracking_reference: string | null };
type Data = { entries: Entry[]; progress: { id: string; user_id: string; record_id: string; saved_at: string }[]; totalAppUsers: number; migrationPending?: boolean; preferences: { user_id: string; opted_out: boolean }[]; drawings: Drawing[]; fulfillment: Fulfillment[]; config: { page_visible: boolean; entries_enabled: boolean; drawings_enabled: boolean; reviewed_at: string | null }; seeds: { id: string; name: string; inventory: number }[]; audit: { id: number; action: string; created_at: string; details: unknown }[] };
export function AdminChallenge() {
  const [week, setWeek] = useState<number>(() => currentWeek(new Date())?.id ?? 1); const [token, setToken] = useState(""); const [data, setData] = useState<Data | null>(null);
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => { let active = true; void (async () => { await completeAdminSessionHandoff(); const session = await supabase?.auth.getSession(); if (active) setToken(session?.data.session?.access_token ?? ""); })();
    const listener = supabase?.auth.onAuthStateChange((_event, session) => { if (active) { generation.current++; setData(null); setToken(session?.access_token ?? ""); } });
    return () => { active = false; listener?.data.subscription.unsubscribe(); }; }, []);
  const load = useCallback(async () => { const current = ++generation.current; if (!token) return; try { const response = await fetch(`/api/admin/challenge?week=${week}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const result = await response.json(); if (!response.ok) throw new Error(result.error); if (current === generation.current) setData(result);
  } catch (error) { if (current === generation.current) { setData(null); setMessage((error as Error).message); } } }, [token, week]);
  useEffect(() => { setData(null); void load(); return () => { generation.current++; }; }, [load]);
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
      <p role="status" className="my-4">{message}</p>

      {data ? <>
        <p>Public page: {data.config.page_visible ? "ON" : "OFF"}. Entries: {data.config.entries_enabled ? "ON" : "OFF"}. Drawings: {data.config.drawings_enabled ? "ON" : "OFF"}.</p>
        {data.migrationPending ? <p>Preview is public. Contest schema has not been deployed; participation and drawings remain disabled.</p> : null}
        <div className="my-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <p>Total app users: {data.totalAppUsers}</p>
          <p>Users with 10+ new records: {[...new Set(data.progress.map(p => p.user_id))].filter(id => data.progress.filter(p => p.user_id === id).length >= 10).length}</p>
          <p>Free email entries: {data.entries.filter(e => e.method === "web").length}</p>
          <p>Total eligible entries: {data.entries.filter(e => e.status === "eligible").length}</p>
        </div>
        <p>One ticket per eligible person, with equal odds for both methods. No different-species or photo-review requirement.</p>
        {data.entries.map(entry => <section key={entry.id} className="field-card my-6 p-6">
          <h2 className="text-xl font-bold">{entry.full_name} — {entry.email}</h2>
          <p>{entry.state} · {entry.method} · {entry.status} · Submitted {entry.submitted_at}</p><p>{entry.review_reason}</p>
          <p>New plant records saved: {data.progress.filter(p => p.user_id === entry.user_id).length}. Automatic app opt-out: {data.preferences.find(p => p.user_id === entry.user_id)?.opted_out ? "ON" : "OFF"}.</p>
          <form method="post" className="mt-4 flex flex-wrap gap-3" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void action({ action: "review_entry", id: entry.id, status: f.get("status"), reason: f.get("reason") }); }}>
            <label>Eligibility <select name="status" defaultValue={entry.status}>{["pending", "eligible", "duplicate", "ineligible", "withdrawn"].map(s => <option key={s}>{s}</option>)}</select></label>
            <label>Decision reason <input name="reason" required minLength={5} maxLength={1000} /></label>
            <button className="button button-secondary" disabled={busy}>Record eligibility decision</button>
          </form>
          <p className="mt-2 text-sm">Similar names/state are a review signal only. Confirm identity before excluding duplicates; shared addresses, devices, or households alone do not disqualify anyone.</p>
        </section>)}
        <section className="field-card p-6"><h2 className="text-2xl font-bold">Immutable weekly drawing</h2>
          {data.drawings.length ? data.drawings.map(d => { const winner = data.entries.find(e => e.id === d.winner_entry_id); const f = data.fulfillment.find(v => v.drawing_id === d.id); return <div key={d.id}>
            <p>Winner: {winner?.full_name} ({winner?.email}). Drawn {d.drawn_at}. Pool size {d.eligible_entry_ids.length}. Algorithm {d.algorithm}, index {d.selected_index}.</p>
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
            <label>Type DRAW WEEK {week}<input name="confirmation" required autoComplete="off" /></label><button className="button button-primary" disabled={busy || !data.config.drawings_enabled}>Select one random winner</button>
          </form>}
        </section>
        <details className="mt-6"><summary>Most recent 100 append-only audit records</summary><pre className="overflow-auto">{JSON.stringify(data.audit, null, 2)}</pre></details>
      </> : null}
    </>}
  </main>;
}
