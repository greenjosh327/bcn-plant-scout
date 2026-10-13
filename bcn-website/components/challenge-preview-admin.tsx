"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { WEEKS } from "@/lib/challenge/core";
import type { PreviewRow } from "@/lib/challenge/preview";
type Report = { total: number; filtered: number; rows: PreviewRow[]; offset: number };
export function ChallengePreviewAdmin({ token }: { token: string }) {
  const [week, setWeek] = useState(""); const [search, setSearch] = useState(""); const [offset, setOffset] = useState(0);
  const [report, setReport] = useState<Report | null>(null); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const params = useCallback(() => new URLSearchParams({ mode: "preview", week, search, offset: String(offset) }), [week, search, offset]);
  const load = useCallback(async () => {
    const id = ++generation.current;
    try {
      const response = await fetch(`/api/admin/challenge?${params()}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      if (id === generation.current) { setReport(body); setMessage(""); }
    } catch (error) { if (id === generation.current) { setReport(null); setMessage((error as Error).message); } }
  }, [params, token]);
  useEffect(() => { setReport(null); const timer = setTimeout(() => void load(), 300); return () => { clearTimeout(timer); generation.current++; }; }, [load]);
  useEffect(() => { const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60000); return () => clearInterval(timer); }, [load]);
  async function download() {
    if (busy) return; setBusy(true);
    try {
      const query = params(); query.set("format", "csv");
      const response = await fetch(`/api/admin/challenge?${query}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = "bcn-preview-submissions.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("CSV downloaded for all matching preview submissions. Email addresses are unverified.");
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  return <section className="field-card my-6 p-5"><h2 className="text-2xl font-black text-pine">Preview Submissions</h2>
    <p className="my-3 rounded-md bg-parchment p-4 font-bold">PREVIEW ONLY — no official entries or prize eligibility. Email addresses are unverified. No email or marketing signup is sent. Retention: 7 days, then daily deletion.</p>
    <p className="my-4 text-xl font-bold">Total preview submissions: {report?.total ?? "Loading / unavailable"}</p>
    <div className="my-4 flex flex-wrap gap-4"><label>Preview week <select value={week} onChange={e => { setWeek(e.target.value); setOffset(0); }}><option value="">All weeks</option>{WEEKS.map(w => <option key={w.id} value={w.id}>Week {w.id}: {w.label}</option>)}</select></label><label>Search preview name or email <input className="rounded-md border p-2" value={search} maxLength={100} onChange={e => { setSearch(e.target.value); setOffset(0); }} /></label><button className="button button-secondary" onClick={() => void load()}>Refresh preview submissions</button><button className="button button-secondary" disabled={busy || !report} onClick={() => void download()}>Export preview CSV</button></div>
    <p role="status">{message}</p>
    {report ? <><p>{report.filtered} matching submission(s).</p><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Name", "Email", "State", "Selected week", "Submission date (ET)", "Status"].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{report.rows.map(r => <tr key={r.id} className="border-t"><td className="p-3">{r.full_name}</td><td className="p-3 break-all">{r.email}</td><td className="p-3">{r.state}</td><td className="p-3">{r.week}</td><td className="p-3">{new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }).format(new Date(r.submitted_at))}</td><td className="p-3">{r.status}</td></tr>)}</tbody></table></div>{!report.rows.length ? <p className="my-4">No matching preview submissions.</p> : null}<div className="mt-4 flex gap-3"><button className="button button-secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>Previous</button><button className="button button-secondary" disabled={offset + 100 >= report.filtered} onClick={() => setOffset(offset + 100)}>Next</button></div></> : null}
  </section>;
}
