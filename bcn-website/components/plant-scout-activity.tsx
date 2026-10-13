"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ACTIVITY_ONLY, type ActivityReport, type activityWeeks } from "@/lib/challenge/activity";
type Data = { activity: ActivityReport; activityWeeks: ReturnType<typeof activityWeeks>; optOutSettingsAvailable: boolean };
export function PlantScoutActivity({ token }: { token: string }) {
  const [week, setWeek] = useState(""), [data, setData] = useState<Data | null>(null), [message, setMessage] = useState("");
  const [user, setUser] = useState(""), [count, setCount] = useState("all"), [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const query = useCallback(() => `mode=activity${week ? `&activityWeek=${encodeURIComponent(week)}` : ""}`, [week]);
  const load = useCallback(async () => {
    const current = ++generation.current;
    try {
      const response = await fetch(`/api/admin/challenge?${query()}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      if (current === generation.current) { setData(result); setMessage(""); }
    } catch (error) { if (current === generation.current) { setData(null); setMessage((error as Error).message); } }
  }, [query, token]);
  useEffect(() => { setData(null); void load(); const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60000); return () => { generation.current++; clearInterval(timer); }; }, [load]);
  async function download() {
    setBusy(true);
    try { const response = await fetch(`/api/admin/challenge?${query()}&format=csv`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob()), link = document.createElement("a"); link.href = url; link.download = `bcn-activity-${data?.activity.week.id}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage("Activity report downloaded. No official contest entries were created.");
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  const rows = data?.activity.users.filter(u => u.label.toLowerCase().includes(user.trim().toLowerCase()) && (count === "all" || count === "ten" && u.savedPlants >= 10 || count === "one" && u.savedPlants > 0 && u.savedPlants < 10 || count === "zero" && u.savedPlants === 0)) ?? [];
  return <section className="mt-6"><h2 className="text-2xl font-black text-pine">Plant Scout activity — all accounts</h2><p className="my-4 rounded-md bg-parchment p-4 font-bold">{ACTIVITY_ONLY}</p>
    <p className="my-3 text-sm">All Plant Scout profile accounts are included, regardless of friend status, trial or subscription. Counts use separate, non-deleted records created in the selected Eastern Time week, not photographs, species or edits. Only cloud-saved records are visible; unsynced device records cannot be counted. No entry or drawing action exists in this activity view.</p>
    <p role="status" className="my-4">{message || (!data ? "Loading activity records…" : "")}</p>
    {data ? <><div className="flex flex-wrap gap-4"><label>Activity week <select value={week || data.activity.week.id} onChange={e => setWeek(e.target.value)}>{data.activityWeeks.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}</select></label><button className="button button-secondary" onClick={() => void load()}>Refresh activity</button><button className="button button-secondary" disabled={busy} onClick={() => void download()}>Download Activity Report</button></div>
      <div className="my-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[["Accounts shown", data.activity.counters.totalAccounts], ["Active accounts (1+ records)", data.activity.counters.activeUsers], ["Reached 10 records", data.activity.counters.usersWithTen], ["Saved 1–9 records", data.activity.counters.usersWithOneToNine], ["New plant records", data.activity.counters.newRecords]].map(([label, value]) => <div key={label} className="field-card p-4"><p className="text-sm font-bold text-stone">{label}</p><p className="mt-2 text-2xl font-black text-pine">{value}</p></div>)}</div>
      <p className="my-3 text-sm">{data.optOutSettingsAvailable ? `${data.activity.counters.optedOutAccountsExcluded} opted-out accounts excluded from named activity and totals.` : "Contest opt-out storage is not installed; no saved contest preferences are available. The report remains read-only activity."} Existing client creation timestamps are provisional and never establish an official entry.</p>
      <div className="my-4 flex flex-wrap gap-4"><label>Filter user <input value={user} onChange={e => setUser(e.target.value)} placeholder="Account email or username" /></label><label>Plant count <select value={count} onChange={e => setCount(e.target.value)}><option value="all">All counts</option><option value="ten">10 or more</option><option value="one">1–9</option><option value="zero">0 records</option></select></label></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Account", "New plant records", "Reached 10", "Status"].map(h => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(u => <tr key={u.id} className="border-t border-pine/10"><td className="p-3 break-all">{u.label}</td><td className="p-3">{u.savedPlants}</td><td className="p-3">{u.reachedTen ? "Yes — activity threshold only" : "No"}</td><td className="p-3">{ACTIVITY_ONLY}</td></tr>)}</tbody></table></div>{!rows.length ? <p className="mt-4">No accounts match these filters.</p> : null}
    </> : null}
  </section>;
}
