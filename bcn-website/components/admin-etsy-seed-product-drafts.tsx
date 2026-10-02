"use client";

import { useState } from "react";

type Preflight = {
  ready: boolean;
  fingerprint: string;
  recoveryListingId: number | null;
  products: Array<{ key: string; title: string; scientificName: string; duplicateListingIds: number[] }>;
  taxonomy: { id: number; path: string } | null;
  shippingProfile: { id: number; title: string } | null;
  processingProfile: { id: number; label: string } | null;
  blockers: string[];
  warnings: string[];
};

type DraftResult = {
  key: string;
  listingId: number;
  state: string;
  title: string;
  imageCount: number;
  variations: Array<{ name: string; price: number; sku: string; quantity: number; isEnabled: boolean }>;
  reviewUrl: string;
};

const CONFIRMATION = "CREATE TWO SEED PRODUCT DRAFTS";

export function AdminEtsySeedProductDrafts({ accessToken }: { accessToken: string }) {
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [results, setResults] = useState<DraftResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function runPreflight() {
    setBusy(true);
    setMessage("");
    setResults([]);
    try {
      const response = await fetch("/api/admin/etsy/listings/seed-product-drafts", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store"
      });
      const payload = (await response.json()) as Preflight & { error?: string };
      if (!response.ok) throw new Error(payload.error || "The draft preflight failed.");
      setPreflight(payload);
      setMessage(payload.ready
        ? payload.recoveryListingId
          ? `Preflight passed. Partial draft ${payload.recoveryListingId} will be recovered; no duplicate will be created.`
          : "Preflight passed. No matching Etsy listings were found."
        : "Preflight blocked creation.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The draft preflight failed.");
    } finally {
      setBusy(false);
    }
  }

  async function createDrafts() {
    if (!preflight?.ready) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/etsy/listings/seed-product-drafts", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ confirmation: CONFIRMATION, fingerprint: preflight.fingerprint })
      });
      const payload = (await response.json()) as { results?: DraftResult[]; error?: string; listingId?: number | null };
      if (!response.ok || !payload.results) {
        throw new Error(`${payload.error || "Draft creation failed."}${payload.listingId ? ` Listing ${payload.listingId} may need review.` : ""}`);
      }
      setResults(payload.results);
      setMessage("Both Etsy listings were created and verified with Etsy's minimum draft-only inventory.");
      setPreflight(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Draft creation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-stone">Temporary owner-only operation</p>
          <h2 className="mt-2 text-2xl font-black text-pine">Create approved Snailseed and Milkweed drafts</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/70">
            This operation creates exactly two Etsy drafts, adds no images, publishes nothing, and verifies Etsy&apos;s minimum
            required draft-only inventory. The listings remain unavailable to buyers.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="button button-secondary" disabled={busy} onClick={() => void runPreflight()}>
            {busy ? "Working..." : "Run draft preflight"}
          </button>
          <button className="button button-primary" disabled={busy || !preflight?.ready} onClick={() => void createDrafts()}>
            Create both drafts
          </button>
        </div>
      </div>

      {message ? <p className="mt-4 rounded-md bg-sage px-4 py-3 text-sm font-bold text-pine">{message}</p> : null}

      {preflight ? (
        <div className="mt-4 space-y-3 text-sm text-ink/75">
          {preflight.products.map((product) => (
            <p key={product.key}><span className="font-black text-pine">{product.title}</span> — matching IDs: {product.duplicateListingIds.join(", ") || "none"}</p>
          ))}
          <p>Taxonomy: {preflight.taxonomy?.path || "not verified"}</p>
          <p>Shipping: {preflight.shippingProfile?.title || "not verified"}</p>
          <p>Processing: {preflight.processingProfile?.label || "not verified"}</p>
          {preflight.blockers.map((blocker) => <p className="font-bold text-rust" key={blocker}>{blocker}</p>)}
          {preflight.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      ) : null}

      {results.length ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {results.map((result) => (
            <div className="rounded-lg border border-pine/10 p-4" key={result.listingId}>
              <p className="font-black text-pine">{result.title}</p>
              <p className="mt-1 text-sm">Listing {result.listingId} / {result.state} / {result.imageCount} images</p>
              {result.variations.map((variation) => (
                <p className="mt-1 text-sm" key={variation.sku}>
                  {variation.name}: ${variation.price.toFixed(2)}, {variation.sku}, quantity {variation.quantity}, {variation.isEnabled ? "enabled" : "disabled"}
                </p>
              ))}
              <a className="mt-3 inline-block font-black text-rust underline" href={result.reviewUrl} target="_blank" rel="noreferrer">
                Review draft
              </a>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
