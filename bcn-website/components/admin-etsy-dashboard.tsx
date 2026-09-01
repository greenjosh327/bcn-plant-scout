"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EtsyDashboardListing, EtsyDashboardShop } from "@/lib/etsy/types";

type EtsyDashboardResponse =
  | { connected: false }
  | {
      connected: true;
      connectedAt: string | null;
      shop: EtsyDashboardShop;
      listings: EtsyDashboardListing[];
    };

const CALLBACK_MESSAGES: Record<string, string> = {
  invalid_or_expired_state: "The Etsy authorization expired or could not be verified. Please connect again.",
  authorization_declined: "Etsy authorization was not completed.",
  missing_code: "Etsy did not return an authorization code. Please connect again.",
  wrong_shop: "That Etsy account is not the BaseCampNorthPA shop.",
  callback_failed: "The Etsy connection could not be completed. Check the server configuration and try again."
};

function formatCurrency(amount: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

function formatDate(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleString();
}

export function AdminEtsyDashboard({ accessToken }: { accessToken: string }) {
  const [dashboard, setDashboard] = useState<EtsyDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState("");

  const sortedListings = useMemo(
    () => dashboard?.connected
      ? [...dashboard.listings].sort((left, right) => right.lastUpdated.localeCompare(left.lastUpdated))
      : [],
    [dashboard]
  );

  const loadDashboard = useCallback(async () => {
    if (!accessToken) return;

    setLoading(true);

    try {
      const response = await fetch("/api/admin/etsy/dashboard", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store"
      });
      const payload = (await response.json()) as EtsyDashboardResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Etsy data could not be loaded.");
      setDashboard(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Etsy data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const callbackStatus = search.get("etsy");
    const callbackReason = search.get("reason") ?? "";

    if (callbackStatus === "connected") {
      setMessage("BaseCampNorthPA is connected to Etsy.");
    } else if (callbackStatus === "error") {
      setMessage(CALLBACK_MESSAGES[callbackReason] || "The Etsy connection could not be completed.");
    }

    if (callbackStatus) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    void loadDashboard();
  }, [loadDashboard]);

  async function connectEtsy() {
    if (!accessToken) return;
    setConnecting(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/etsy/connect", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const payload = (await response.json()) as { authorizeUrl?: string; error?: string };
      if (!response.ok || !payload.authorizeUrl) {
        throw new Error(payload.error || "Etsy authorization could not start.");
      }

      const authorizeUrl = new URL(payload.authorizeUrl);
      if (authorizeUrl.protocol !== "https:" || authorizeUrl.hostname !== "www.etsy.com") {
        throw new Error("The Etsy authorization URL was not valid.");
      }
      window.location.assign(authorizeUrl.toString());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Etsy authorization could not start.");
      setConnecting(false);
    }
  }

  function refreshDashboard() {
    setMessage("");
    void loadDashboard();
  }

  return (
    <section className="mt-8 space-y-6">
      <div className="field-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-stone">Phase 1 / read only</p>
            <h2 className="mt-2 text-2xl font-black text-pine">Etsy connection</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/70">
              View the BaseCampNorthPA shop and active Etsy listings. This connection cannot create, edit,
              renew, deactivate, delete, or publish listings, and it does not change BCN inventory.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="button button-secondary" onClick={refreshDashboard} disabled={loading}>
              {loading ? "Loading..." : "Refresh Etsy"}
            </button>
            <button className="button button-primary" onClick={() => void connectEtsy()} disabled={connecting}>
              {connecting ? "Connecting..." : dashboard?.connected ? "Reconnect Etsy" : "Connect Etsy"}
            </button>
          </div>
        </div>

        {message ? <p className="mt-4 rounded-md bg-sage px-4 py-3 text-sm font-bold text-pine">{message}</p> : null}
      </div>

      {!loading && dashboard && !dashboard.connected ? (
        <div className="field-card p-6">
          <p className="font-black text-rust">BaseCampNorthPA is not connected.</p>
          <p className="mt-2 text-sm leading-6 text-ink/70">
            Use Connect Etsy and authorize the approved Base Camp North Etsy application while signed into the
            BaseCampNorthPA Etsy account.
          </p>
        </div>
      ) : null}

      {dashboard?.connected ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <EtsyMetric label="Connection" value="Connected" detail={`Since ${formatDate(dashboard.connectedAt)}`} />
            <EtsyMetric
              label="Active listings"
              value={String(dashboard.listings.length)}
              detail={`${dashboard.shop.activeListingCount} reported by Etsy`}
            />
            <EtsyMetric
              label="Shop status"
              value={dashboard.shop.isVacation ? "Vacation" : "Open"}
              detail={dashboard.shop.currencyCode || "Currency not reported"}
            />
            <EtsyMetric
              label="Reviews"
              value={dashboard.shop.reviewAverage === null ? "No rating" : dashboard.shop.reviewAverage.toFixed(2)}
              detail={`${dashboard.shop.reviewCount} reviews`}
            />
          </div>

          <div className="field-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-stone">Authenticated shop</p>
                <h2 className="mt-2 text-2xl font-black text-pine">{dashboard.shop.shopName}</h2>
                <p className="mt-1 text-sm text-ink/70">
                  Shop ID {dashboard.shop.shopId}{dashboard.shop.title ? ` / ${dashboard.shop.title}` : ""}
                </p>
              </div>
              {dashboard.shop.url ? (
                <a className="button button-secondary" href={dashboard.shop.url} target="_blank" rel="noreferrer">
                  Open Etsy shop
                </a>
              ) : null}
            </div>
          </div>

          <div className="field-card overflow-hidden">
            <div className="border-b border-pine/10 p-6">
              <h2 className="text-2xl font-black text-pine">Active Etsy listings</h2>
              <p className="mt-1 text-sm text-ink/70">All active listings returned by Etsy, newest updates first.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-sage/70 text-xs font-black uppercase tracking-[0.12em] text-stone">
                  <tr>
                    <th className="px-5 py-3">Title</th>
                    <th className="px-5 py-3">Listing ID</th>
                    <th className="px-5 py-3">State</th>
                    <th className="px-5 py-3">Quantity</th>
                    <th className="px-5 py-3">Price</th>
                    <th className="px-5 py-3">Last updated</th>
                    <th className="px-5 py-3">URL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pine/10">
                  {sortedListings.map((listing) => (
                      <tr key={listing.listingId} className="align-top">
                        <td className="max-w-md px-5 py-4 font-bold text-pine">{listing.title}</td>
                        <td className="px-5 py-4 text-ink/70">{listing.listingId}</td>
                        <td className="px-5 py-4 capitalize text-ink/70">{listing.state}</td>
                        <td className="px-5 py-4 text-ink/70">{listing.quantity}</td>
                        <td className="px-5 py-4 text-ink/70">
                          {formatCurrency(listing.price, listing.currencyCode)}
                        </td>
                        <td className="px-5 py-4 text-ink/70">{formatDate(listing.lastUpdated)}</td>
                        <td className="px-5 py-4">
                          <a className="font-black text-rust underline" href={listing.url} target="_blank" rel="noreferrer">
                            View
                          </a>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {dashboard.listings.length === 0 ? (
              <p className="p-6 text-sm font-bold text-stone">No active Etsy listings were returned.</p>
            ) : null}
          </div>

          <div className="field-card overflow-hidden">
            <div className="border-b border-pine/10 p-6">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-stone">Read only</p>
              <h2 className="mt-2 text-2xl font-black text-pine">Etsy inventory comparison</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/70">
                Etsy variation quantities, prices, and SKUs are shown for comparison only. BCN physical inventory is
                counted in 25-seed packs; for later planning, a 100-seed option represents 4 physical 25-seed packs.
                No stock conversion, matching, deduction, or synchronization happens here.
              </p>
            </div>

            <div className="divide-y divide-pine/10">
              {sortedListings.map((listing) => (
                <section key={listing.listingId} className="p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black text-pine">{listing.title}</h3>
                      <p className="mt-1 text-xs font-bold text-ink/60">Listing ID {listing.listingId}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs font-black text-pine">
                      <span className="rounded-full bg-sage px-3 py-1.5">
                        Price varies: {listing.inventory.priceVaries ? "Yes" : "No"}
                      </span>
                      <span className="rounded-full bg-sage px-3 py-1.5">
                        Quantity varies: {listing.inventory.quantityVaries ? "Yes" : "No"}
                      </span>
                    </div>
                  </div>

                  {!listing.inventory.recordAvailable ? (
                    <p className="mt-4 rounded-md bg-sage/60 px-4 py-3 text-sm font-bold text-stone">
                      Etsy did not return an inventory record for this listing. The listing-level quantity and price
                      remain available above.
                    </p>
                  ) : listing.inventory.offerings.length === 0 ? (
                    <p className="mt-4 rounded-md bg-sage/60 px-4 py-3 text-sm font-bold text-stone">
                      Etsy returned an inventory record with no active offerings.
                    </p>
                  ) : (
                    <div className="mt-4 overflow-x-auto rounded-lg border border-pine/10">
                      <table className="w-full min-w-[760px] text-left text-sm">
                        <thead className="bg-sage/70 text-xs font-black uppercase tracking-[0.12em] text-stone">
                          <tr>
                            <th className="px-4 py-3">Variation option</th>
                            <th className="px-4 py-3">Etsy quantity</th>
                            <th className="px-4 py-3">Etsy price</th>
                            <th className="px-4 py-3">SKU</th>
                            <th className="px-4 py-3">Offering</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-pine/10">
                          {listing.inventory.offerings.map((offering) => (
                            <tr key={`${offering.productId}-${offering.offeringId}`} className="align-top">
                              <td className="px-4 py-4">
                                {offering.options.length === 0 ? (
                                  <div>
                                    <p className="font-black text-pine">Default offering</p>
                                    <p className="mt-1 text-xs font-bold text-ink/55">No Etsy variations</p>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {offering.options.map((option) => (
                                      <div key={`${option.propertyId}-${option.value}`}>
                                        <p className="font-black text-pine">
                                          {option.name}: {option.value}
                                        </p>
                                        <p className="mt-1 text-xs font-bold text-ink/55">
                                          Price {option.priceVaries ? "varies" : "does not vary"} by this option
                                          {" / "}
                                          Quantity {option.quantityVaries ? "varies" : "does not vary"} by this option
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-4 font-black text-pine">{offering.quantity}</td>
                              <td className="px-4 py-4 text-ink/70">
                                {formatCurrency(offering.price, offering.currencyCode)}
                              </td>
                              <td className="px-4 py-4 text-ink/70">{offering.sku || "Not set"}</td>
                              <td className="px-4 py-4 text-ink/70">
                                {offering.isEnabled ? "Enabled" : "Disabled"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ))}
            </div>

            {sortedListings.length === 0 ? (
              <p className="p-6 text-sm font-bold text-stone">No active Etsy listings are available to compare.</p>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function EtsyMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="field-card p-5">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-stone">{label}</p>
      <p className="mt-2 text-3xl font-black text-pine">{value}</p>
      <p className="mt-2 text-xs font-bold text-ink/60">{detail}</p>
    </div>
  );
}
