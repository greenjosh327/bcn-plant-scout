"use client";

import { useMemo, useState } from "react";
import type { EtsyInventoryProposal } from "@/lib/etsy/inventory-proposals";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleString();
}

function statusClass(status: EtsyInventoryProposal["rows"][number]["matchStatus"]) {
  return status === "confirmed"
    ? "bg-sage text-pine"
    : status === "suggested"
      ? "bg-amber-100 text-amber-900"
      : "bg-orange-100 text-rust";
}

export function AdminEtsyInventoryManager({
  accessToken,
  grantedScopes
}: {
  accessToken: string;
  grantedScopes: string[];
}) {
  const [proposal, setProposal] = useState<EtsyInventoryProposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmingListingId, setConfirmingListingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [applying, setApplying] = useState(false);

  const changedRows = useMemo(
    () => proposal?.rows.filter((row) => row.eligible && row.isChange) || [],
    [proposal]
  );
  const listingsNeedingConfirmation = useMemo(() => {
    const byListing = new Map<number, EtsyInventoryProposal["rows"][number]>();
    for (const row of proposal?.rows || []) {
      if (row.canConfirmMapping && !byListing.has(row.listingId)) byListing.set(row.listingId, row);
    }
    return [...byListing.values()];
  }, [proposal]);
  const hasWriteScope = grantedScopes.includes("listings_w") || proposal?.hasInventoryWriteScope;

  async function generateProposal() {
    if (!accessToken) return;
    setLoading(true);
    setMessage("");
    setReviewOpen(false);

    try {
      const response = await fetch("/api/admin/etsy/inventory/proposal", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store"
      });
      const payload = (await response.json()) as EtsyInventoryProposal & { error?: string };
      if (!response.ok) throw new Error(payload.error || "The Etsy inventory proposal could not be generated.");
      setProposal(payload);
      setMessage("Dry-run proposal generated. No Etsy inventory was changed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Etsy inventory proposal could not be generated.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmMapping(listingId: number) {
    setConfirmingListingId(listingId);
    setMessage("");

    try {
      const response = await fetch("/api/admin/etsy/inventory/mappings/confirm", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ listingId }),
        cache: "no-store"
      });
      const payload = (await response.json()) as { mapping?: { species: string }; error?: string };
      if (!response.ok) throw new Error(payload.error || "The Etsy mapping could not be confirmed.");
      setMessage(`${payload.mapping?.species || "Etsy"} mapping confirmed. Generate a fresh proposal to use it.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Etsy mapping could not be confirmed.");
    } finally {
      setConfirmingListingId(null);
    }
  }

  async function applyProposal() {
    if (!proposal || confirmation !== "APPLY ETSY INVENTORY") return;
    setApplying(true);
    setMessage("");

    try {
      const response = await fetch(`/api/admin/etsy/inventory/proposal/${proposal.proposalId}/apply`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ confirmation }),
        cache: "no-store"
      });
      const payload = (await response.json()) as { error?: string; changeSet?: { status?: string } };
      if (!response.ok) throw new Error(payload.error || "The Etsy inventory proposal could not be applied.");
      setMessage(`Etsy inventory result: ${payload.changeSet?.status || "completed"}. Generate a fresh proposal to verify.`);
      setReviewOpen(false);
      setConfirmation("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Etsy inventory proposal could not be applied.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="field-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-stone">Phase 2 / controlled inventory</p>
            <h2 className="mt-2 text-2xl font-black text-pine">BCN physical inventory and Etsy dry run</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/70">
              BCN stock is counted in finished 25-seed packs. Generate a proposal to compare confirmed physical stock
              with Etsy availability. Page loads, Etsy refreshes, and proposal generation never write Etsy inventory.
            </p>
          </div>
          <button className="button button-primary" onClick={() => void generateProposal()} disabled={loading}>
            {loading ? "Generating..." : "Generate inventory proposal"}
          </button>
        </div>

        {!hasWriteScope ? (
          <p className="mt-4 rounded-md bg-amber-100 px-4 py-3 text-sm font-bold text-amber-900">
            Reconnect Etsy above to grant the minimum <code>listings_w</code> scope. Dry-run review remains available,
            but no proposal can be applied without that scope.
          </p>
        ) : null}

        <p className="mt-4 rounded-md bg-sage px-4 py-3 text-sm font-bold text-pine">
          Live Etsy inventory writes are {proposal?.inventoryWritesEnabled ? "enabled for explicitly approved proposals" : "locked pending owner review of the first proposal"}.
        </p>
        {message ? <p className="mt-4 text-sm font-bold text-rust">{message}</p> : null}
      </div>

      {proposal ? (
        <>
          <div className="field-card overflow-hidden">
            <div className="border-b border-pine/10 p-6">
              <h2 className="text-2xl font-black text-pine">BCN physical seed inventory</h2>
              <p className="mt-1 text-sm text-ink/70">
                Authoritative physical snapshot in Supabase. One inventory unit equals one finished 25-seed pack.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="bg-sage/70 text-xs font-black uppercase tracking-[0.12em] text-stone">
                  <tr>
                    <th className="px-5 py-3">Species</th>
                    <th className="px-5 py-3">Scientific name</th>
                    <th className="px-5 py-3">25-pack units</th>
                    <th className="px-5 py-3">Total seeds</th>
                    <th className="px-5 py-3">BCN product</th>
                    <th className="px-5 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pine/10">
                  {proposal.physicalInventory.map((item) => (
                    <tr key={item.productId}>
                      <td className="px-5 py-4 font-black text-pine">{item.species}</td>
                      <td className="px-5 py-4 italic text-ink/70">{item.scientificName}</td>
                      <td className="px-5 py-4 font-black text-pine">{item.physicalPacks}</td>
                      <td className="px-5 py-4 text-ink/70">{item.totalSeeds.toLocaleString()}</td>
                      <td className="px-5 py-4 text-ink/70">{item.activeInBcnShop ? "Active" : "Inventory only"}</td>
                      <td className="px-5 py-4 text-ink/70">{formatDate(item.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {listingsNeedingConfirmation.length > 0 ? (
            <div className="field-card p-6">
              <h2 className="text-2xl font-black text-pine">Owner mapping review</h2>
              <p className="mt-2 text-sm leading-6 text-ink/70">
                These exact species and pack-size matches are suggestions only. Confirming stores the mapping in BCN;
                it does not change Etsy. Unmatched, mixed-species, Staghorn Sumac, and Black Cherry listings cannot be confirmed here.
              </p>
              <div className="mt-4 space-y-3">
                {listingsNeedingConfirmation.map((row) => (
                  <div key={row.listingId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-pine/10 p-4">
                    <div>
                      <p className="font-black text-pine">{row.species}</p>
                      <p className="mt-1 text-sm text-ink/70">{row.listingTitle} / Listing {row.listingId}</p>
                    </div>
                    <button
                      className="button button-secondary"
                      onClick={() => void confirmMapping(row.listingId)}
                      disabled={confirmingListingId !== null}
                    >
                      {confirmingListingId === row.listingId ? "Confirming..." : "Confirm safe mapping"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InventoryMetric label="Changed offerings" value={proposal.summary.changedOfferings} />
            <InventoryMetric label="Confirmed offerings" value={proposal.summary.confirmedOfferings} />
            <InventoryMetric label="Blocked / review" value={proposal.summary.blockedOfferings} />
            <InventoryMetric label="Proposal expires" value={formatDate(proposal.expiresAt)} compact />
          </div>

          <div className="field-card overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-pine/10 p-6">
              <div>
                <h2 className="text-2xl font-black text-pine">Proposed Etsy inventory changes</h2>
                <p className="mt-1 text-sm text-ink/70">
                  Proposal {proposal.proposalId}. Only confirmed rows can become writes; unmatched rows remain read only.
                </p>
              </div>
              <button
                className="button button-primary"
                disabled={!proposal.canApply}
                onClick={() => setReviewOpen(true)}
              >
                {proposal.inventoryWritesEnabled ? `Review ${changedRows.length} changes` : "Apply locked pending review"}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1500px] text-left text-sm">
                <thead className="bg-sage/70 text-xs font-black uppercase tracking-[0.12em] text-stone">
                  <tr>
                    <th className="px-4 py-3">Species</th>
                    <th className="px-4 py-3">Listing ID</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Variation</th>
                    <th className="px-4 py-3">Current qty</th>
                    <th className="px-4 py-3">Current packs</th>
                    <th className="px-4 py-3">Physical packs</th>
                    <th className="px-4 py-3">Proposed qty</th>
                    <th className="px-4 py-3">Proposed packs</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pine/10">
                  {proposal.rows.map((row) => (
                    <tr key={`${row.listingId}-${row.etsyProductId}-${row.etsyOfferingId}`} className="align-top">
                      <td className="px-4 py-4 font-black text-pine">{row.species}</td>
                      <td className="px-4 py-4 text-ink/70">{row.listingId}</td>
                      <td className="px-4 py-4 text-ink/70">{row.sku || "Not set"}</td>
                      <td className="px-4 py-4 text-ink/70">
                        <p className="font-bold text-pine">{row.variationName}</p>
                        <p className="mt-1 text-xs">{row.packsConsumed ? `${row.packsConsumed} physical pack${row.packsConsumed === 1 ? "" : "s"} per sale` : "Pack conversion unconfirmed"}</p>
                      </td>
                      <td className="px-4 py-4 font-black text-pine">{row.currentQuantity}</td>
                      <td className="px-4 py-4 text-ink/70">{row.currentPackCommitment ?? "Unconfirmed"}</td>
                      <td className="px-4 py-4 text-ink/70">{row.physicalPackInventory ?? "Unmatched"}</td>
                      <td className="px-4 py-4 font-black text-pine">{row.proposedQuantity}</td>
                      <td className="px-4 py-4 text-ink/70">{row.proposedPackCommitment ?? "Unconfirmed"}</td>
                      <td className="max-w-sm px-4 py-4">
                        <span className={`inline-block rounded-full px-3 py-1 text-xs font-black uppercase ${statusClass(row.matchStatus)}`}>
                          {row.matchStatus.replace("_", " ")}
                        </span>
                        <p className="mt-2 text-xs font-bold leading-5 text-ink/65">{row.warning}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {reviewOpen ? (
            <div className="field-card border-2 border-rust p-6">
              <h2 className="text-2xl font-black text-pine">Final Etsy quantity confirmation</h2>
              <p className="mt-2 text-sm leading-6 text-ink/70">
                This is the only step that can contact Etsy with an inventory write. The server rechecks BCN stock,
                Etsy quantities, mappings, proposal age, and the write gate before sending anything.
              </p>
              <div className="mt-4 overflow-x-auto rounded-lg border border-pine/10">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-sage/70 text-xs font-black uppercase tracking-[0.12em] text-stone">
                    <tr>
                      <th className="px-4 py-3">Species</th>
                      <th className="px-4 py-3">Listing</th>
                      <th className="px-4 py-3">Variation</th>
                      <th className="px-4 py-3">Before</th>
                      <th className="px-4 py-3">After</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pine/10">
                    {changedRows.map((row) => (
                      <tr key={`${row.listingId}-${row.etsyOfferingId}`}>
                        <td className="px-4 py-3 font-black text-pine">{row.species}</td>
                        <td className="px-4 py-3 text-ink/70">{row.listingId}</td>
                        <td className="px-4 py-3 text-ink/70">{row.variationName}</td>
                        <td className="px-4 py-3 text-ink/70">{row.currentQuantity}</td>
                        <td className="px-4 py-3 font-black text-pine">{row.proposedQuantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className="mt-5 block text-sm font-black text-pine" htmlFor="etsy-confirmation">
                Type APPLY ETSY INVENTORY to confirm these exact changes
              </label>
              <input
                id="etsy-confirmation"
                className="mt-2 w-full rounded-lg border border-pine/20 bg-white px-4 py-3"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
              />
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  className="button button-primary"
                  disabled={confirmation !== "APPLY ETSY INVENTORY" || applying}
                  onClick={() => void applyProposal()}
                >
                  {applying ? "Applying..." : `Apply ${changedRows.length} approved changes`}
                </button>
                <button className="button button-secondary" onClick={() => setReviewOpen(false)} disabled={applying}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function InventoryMetric({ label, value, compact = false }: { label: string; value: string | number; compact?: boolean }) {
  return (
    <div className="field-card p-5">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-stone">{label}</p>
      <p className={`mt-2 font-black text-pine ${compact ? "text-base" : "text-3xl"}`}>{value}</p>
    </div>
  );
}
