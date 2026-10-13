"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GiveawayReport, WeekReport } from "@/lib/challenge/reporting";
type Aggregate = Omit<GiveawayReport, "weeks"> & { weeks: Omit<WeekReport, "participants">[] };
export function GiveawayAnalytics({ getAccessToken }: { getAccessToken: () => Promise<string | null> }) {
  const [report, setReport] = useState<Aggregate | null>(null), [error, setError] = useState("");
  const generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current;
    try {
      const token = await getAccessToken(); if (!token) throw new Error("Sign in as a BCN admin to view giveaway analytics.");
      const response = await fetch("/api/admin/challenge?view=analytics", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      if (current === generation.current) { setReport(result.report); setError(""); }
    } catch (failure) { if (current === generation.current) { setReport(null); setError((failure as Error).message); } }
  }, [getAccessToken]);
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  return <section className="field-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-black text-pine">Weekly Giveaway analytics</h2><div className="flex flex-wrap gap-3"><a className="button button-secondary" href="/admin/challenge">Review giveaway participants</a><button className="button button-secondary" onClick={() => void load()}>Refresh giveaway metrics</button></div></div>
    {error ? <p role="status" className="mt-4">{error}</p> : null}
    {report ? <><p className="my-4 text-sm">Participation by contest week (Eastern Time). Weekly active means accounts saving 1+ new records. {report.timestampBasis === "legacy_preview" ? "Client-created timestamps are provisional; official contest schema is pending." : "Uses immutable creation/save timestamps."} Read-only reporting creates no entries.</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Week", "Active accounts", "New records", "10+ records", "Free email entries", "Official eligible participants", "Winners"].map(h => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{report.weeks.map(w => <tr key={w.week} className="border-t border-pine/10"><td className="p-3">{w.label}</td>{[w.counters.activeUsers, w.counters.newRecords, w.counters.usersWithTen, w.counters.freeEntries, w.counters.eligibleParticipants, w.counters.winners].map((n, i) => <td className="p-3" key={i}>{n ?? "Unavailable"}</td>)}</tr>)}</tbody></table></div><p className="mt-4 text-sm font-bold">Subscription conversions: {report.subscriptionConversions.reason}</p></> : !error ? <p className="mt-4">Loading giveaway metrics…</p> : null}
  </section>;
}
