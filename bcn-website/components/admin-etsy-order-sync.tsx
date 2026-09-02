"use client";

import { useCallback, useEffect, useState } from "react";

type OrderSyncStatus = {
  connected: boolean;
  orderReadScopeGranted: boolean;
  orderSyncEnabled: boolean;
  baseline: null | {
    baseline_at: string;
    baseline_initialized_at: string;
    cursor_updated_at: string;
    last_attempt_at: string | null;
    last_successful_sync_at: string | null;
    active_run_id: string | null;
    lease_expires_at: string | null;
    last_error: string | null;
  };
  lastRun: null | {
    id: string;
    status: string;
    paid_receipts_found: number;
    transactions_found: number;
    matched_transactions: number;
    manual_review_transactions: number;
    physical_packs_decremented: number;
    reconciliation_proposal_id: string | null;
    started_at: string;
    completed_at: string | null;
    error_summary: string | null;
  };
  manualReview: Array<{
    transaction_id: number;
    receipt_id: number;
    listing_id: number | null;
    sku: string | null;
    variation_label: string;
    quantity_purchased: number;
    bcn_product_id: string | null;
    physical_packs_consumed: number | null;
    processing_status: string;
    review_reason: string | null;
    last_seen_at: string;
    species: string;
  }>;
  physicalInventory: Array<{
    productId: string;
    species: string;
    physicalPacks: number;
    totalSeeds: number;
    updatedAt: string | null;
    blocked: boolean;
  }>;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleString();
}

function labelStatus(value: string) {
  return value.replaceAll("_", " ");
}

export function AdminEtsyOrderSync({
  accessToken,
  grantedScopes
}: {
  accessToken: string;
  grantedScopes: string[];
}) {
  const [status, setStatus] = useState<OrderSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showBaselineConfirmation, setShowBaselineConfirmation] = useState(false);
  const [showSyncConfirmation, setShowSyncConfirmation] = useState(false);
  const [baselineConfirmation, setBaselineConfirmation] = useState("");
  const [syncConfirmation, setSyncConfirmation] = useState("");
  const [message, setMessage] = useState("");

  const loadStatus = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const response = await fetch("/api/admin/etsy/orders", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store"
      });
      const payload = await response.json() as OrderSyncStatus & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Etsy order-sync status could not be loaded.");
      setStatus(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Etsy order-sync status could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const scopeGranted = grantedScopes.includes("transactions_r") && Boolean(status?.orderReadScopeGranted);
  const syncDisabledReason = (() => {
    if (!scopeGranted) return "Reconnect Etsy to grant transactions_r.";
    if (!status?.baseline) return "Initialize the owner-approved current-time baseline first.";
    if (!status.orderSyncEnabled) return "The production order-sync safety flag is disabled.";
    if (status.baseline.active_run_id) return "Another order sync is already active.";
    return "";
  })();

  async function initializeBaseline() {
    if (!accessToken || baselineConfirmation !== "START ETSY ORDER SYNC") return;
    setInitializing(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/etsy/orders/baseline", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ confirmation: baselineConfirmation })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "The order-sync baseline could not be initialized.");
      setMessage("Current-time Etsy order-sync baseline initialized. No orders were fetched and no inventory changed.");
      setBaselineConfirmation("");
      setShowBaselineConfirmation(false);
      await loadStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The order-sync baseline could not be initialized.");
    } finally {
      setInitializing(false);
    }
  }

  async function syncOrders() {
    if (!accessToken || syncConfirmation !== "SYNC ETSY ORDERS" || syncDisabledReason) return;
    setSyncing(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/etsy/orders/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ confirmation: syncConfirmation, clientRequestId: crypto.randomUUID() })
      });
      const payload = await response.json() as OrderSyncStatus & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Etsy orders could not be synchronized.");
      setStatus(payload);
      setMessage("Etsy order sync finished. Review the audited results and any generated proposal before taking another action.");
      setSyncConfirmation("");
      setShowSyncConfirmation(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Etsy orders could not be synchronized.");
      await loadStatus();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="space-y-5" aria-labelledby="etsy-order-sync-heading">
      <div className="field-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-stone">Phase 2.5 / BCN inventory only</p>
            <h2 id="etsy-order-sync-heading" className="mt-2 text-2xl font-black text-pine">Etsy Order Sync</h2>
            <p className="mt-2 text-sm leading-6 text-ink/70">
              A manual sync reads paid Etsy orders and deducts only exact, confirmed mappings from BCN physical
              25-seed-pack inventory. It never writes Etsy inventory; any follow-up Etsy quantities remain a separate
              Phase 2 proposal requiring owner review and confirmation.
            </p>
          </div>
          <button className="button button-secondary" onClick={() => void loadStatus()} disabled={loading || syncing}>
            {loading ? "Loading..." : "Refresh order status"}
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <StatusPill label="transactions_r" value={scopeGranted ? "Granted" : "Reconnect required"} good={scopeGranted} />
          <StatusPill label="Sync flag" value={status?.orderSyncEnabled ? "Enabled" : "Disabled"} good={Boolean(status?.orderSyncEnabled)} />
          <StatusPill label="Baseline" value={status?.baseline ? formatDate(status.baseline.baseline_at) : "Not initialized"} good={Boolean(status?.baseline)} />
        </div>

        {!scopeGranted ? (
          <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm font-bold text-rust">
            Use Reconnect Etsy above and approve the requested transactions_r read scope. No additional Etsy write scope is requested.
          </p>
        ) : null}
        {message ? <p className="mt-4 rounded-md bg-sage px-4 py-3 text-sm font-bold text-pine">{message}</p> : null}

        {!status?.baseline ? (
          <div className="mt-5 rounded-lg border border-pine/15 p-5">
            <h3 className="font-black text-pine">Owner-approved first-sync baseline</h3>
            <p className="mt-2 text-sm leading-6 text-ink/70">
              The baseline defaults to the instant you confirm it. Earlier Etsy history will not be imported. This step
              only saves the timestamp; it does not fetch orders, decrement stock, or generate a proposal.
            </p>
            {!showBaselineConfirmation ? (
              <button
                className="button button-secondary mt-4"
                disabled={!scopeGranted || initializing}
                onClick={() => setShowBaselineConfirmation(true)}
              >
                Initialize current-time baseline
              </button>
            ) : (
              <div className="mt-4">
                <label className="block text-sm font-black text-pine" htmlFor="etsy-baseline-confirmation">
                  Type START ETSY ORDER SYNC
                </label>
                <input
                  id="etsy-baseline-confirmation"
                  className="mt-2 w-full rounded-lg border border-pine/20 bg-white px-4 py-3"
                  value={baselineConfirmation}
                  onChange={(event) => setBaselineConfirmation(event.target.value)}
                  autoComplete="off"
                />
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    className="button button-primary"
                    disabled={baselineConfirmation !== "START ETSY ORDER SYNC" || initializing}
                    onClick={() => void initializeBaseline()}
                  >
                    {initializing ? "Initializing..." : "Confirm baseline now"}
                  </button>
                  <button className="button button-secondary" onClick={() => setShowBaselineConfirmation(false)} disabled={initializing}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-5 rounded-lg border border-pine/15 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="font-black text-pine">Manual paid-order sync</h3>
              <p className="mt-2 text-sm text-ink/70">Last successful sync: {formatDate(status?.baseline?.last_successful_sync_at)}</p>
              {syncDisabledReason ? <p className="mt-2 text-sm font-bold text-rust">{syncDisabledReason}</p> : null}
            </div>
            <button
              className="button button-primary"
              disabled={Boolean(syncDisabledReason) || syncing}
              onClick={() => setShowSyncConfirmation(true)}
            >
              Sync Etsy Orders
            </button>
          </div>
          {showSyncConfirmation ? (
            <div className="mt-4 border-t border-pine/10 pt-4">
              <label className="block text-sm font-black text-pine" htmlFor="etsy-order-sync-confirmation">
                Type SYNC ETSY ORDERS
              </label>
              <input
                id="etsy-order-sync-confirmation"
                className="mt-2 w-full rounded-lg border border-pine/20 bg-white px-4 py-3"
                value={syncConfirmation}
                onChange={(event) => setSyncConfirmation(event.target.value)}
                autoComplete="off"
              />
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  className="button button-primary"
                  disabled={syncConfirmation !== "SYNC ETSY ORDERS" || syncing}
                  onClick={() => void syncOrders()}
                >
                  {syncing ? "Syncing..." : "Confirm one read-only Etsy order fetch"}
                </button>
                <button className="button button-secondary" onClick={() => setShowSyncConfirmation(false)} disabled={syncing}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {status?.lastRun ? (
        <div className="field-card p-6">
          <h3 className="text-xl font-black text-pine">Last order-sync result</h3>
          <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-stone">
            {labelStatus(status.lastRun.status)} / {formatDate(status.lastRun.completed_at || status.lastRun.started_at)}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Metric label="New paid orders" value={status.lastRun.paid_receipts_found} />
            <Metric label="Transactions found" value={status.lastRun.transactions_found} />
            <Metric label="Matched" value={status.lastRun.matched_transactions} />
            <Metric label="Manual review" value={status.lastRun.manual_review_transactions} />
            <Metric label="Packs decremented" value={status.lastRun.physical_packs_decremented} />
          </div>
          <p className="mt-4 text-sm font-bold text-ink/70">
            Etsy reconciliation proposal: {status.lastRun.reconciliation_proposal_id ? `Generated (${status.lastRun.reconciliation_proposal_id})` : "Not generated"}
          </p>
          {status.lastRun.error_summary ? <p className="mt-2 text-sm font-bold text-rust">{status.lastRun.error_summary}</p> : null}
        </div>
      ) : null}

      {status ? (
        <div className="field-card overflow-hidden">
          <div className="border-b border-pine/10 p-6">
            <h3 className="text-xl font-black text-pine">Resulting BCN physical inventory</h3>
            <p className="mt-1 text-sm text-ink/70">The same products.inventory values used by the BCN storefront.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-sage/70 text-xs font-black uppercase tracking-[0.12em] text-stone">
                <tr><th className="px-5 py-3">Species</th><th className="px-5 py-3">25-seed packs</th><th className="px-5 py-3">Total seeds</th><th className="px-5 py-3">Handling</th></tr>
              </thead>
              <tbody className="divide-y divide-pine/10">
                {status.physicalInventory.map((item) => (
                  <tr key={item.productId}>
                    <td className="px-5 py-4 font-black text-pine">{item.species}</td>
                    <td className="px-5 py-4">{item.physicalPacks}</td>
                    <td className="px-5 py-4">{item.totalSeeds}</td>
                    <td className="px-5 py-4 text-ink/70">{item.blocked ? "Blocked / manual review" : "Confirmed mapping required"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {status?.manualReview.length ? (
        <div className="field-card overflow-hidden">
          <div className="border-b border-pine/10 p-6">
            <h3 className="text-xl font-black text-pine">Order transactions needing manual review</h3>
            <p className="mt-1 text-sm text-ink/70">These records did not decrement BCN inventory.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-sage/70 text-xs font-black uppercase tracking-[0.12em] text-stone">
                <tr><th className="px-4 py-3">Species</th><th className="px-4 py-3">Receipt / transaction</th><th className="px-4 py-3">Listing</th><th className="px-4 py-3">Variation / SKU</th><th className="px-4 py-3">Reason</th></tr>
              </thead>
              <tbody className="divide-y divide-pine/10">
                {status.manualReview.map((item) => (
                  <tr key={item.transaction_id} className="align-top">
                    <td className="px-4 py-4 font-black text-pine">{item.species}</td>
                    <td className="px-4 py-4">{item.receipt_id} / {item.transaction_id}</td>
                    <td className="px-4 py-4">{item.listing_id}</td>
                    <td className="px-4 py-4">{item.variation_label || "Default"}<br/><span className="text-xs text-ink/60">{item.sku || "No SKU"}</span></td>
                    <td className="max-w-sm px-4 py-4 text-ink/70">{item.review_reason || labelStatus(item.processing_status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function StatusPill({ label, value, good }: { label: string; value: string; good: boolean }) {
  return <div className={`rounded-lg px-4 py-3 ${good ? "bg-sage" : "bg-amber-50"}`}><p className="text-xs font-black uppercase tracking-[0.12em] text-stone">{label}</p><p className={`mt-1 text-sm font-black ${good ? "text-pine" : "text-rust"}`}>{value}</p></div>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-sage/60 p-4"><p className="text-xs font-black uppercase tracking-[0.12em] text-stone">{label}</p><p className="mt-2 text-2xl font-black text-pine">{value}</p></div>;
}
