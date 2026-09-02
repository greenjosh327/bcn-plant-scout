"use client";

import { useState } from "react";
import type { MuscadineDraftPreflight, MuscadineDraftReadback } from "@/lib/etsy/muscadine-draft";

const CONFIRMATION = "CREATE MUSCADINE DRAFT";

type ImageChoice = { rank: 1 | 2 | 3; label: string; expectedFile: string; file: File | null };

const INITIAL_IMAGES: ImageChoice[] = [
  { rank: 1, label: "Primary: muscadine fruit growing on the vine", expectedFile: "20260830_100448.jpg", file: null },
  { rank: 2, label: "Second: wide bowl view of cleaned seeds", expectedFile: "20260902_151723.jpg", file: null },
  { rank: 3, label: "Third: close-up view of cleaned seeds", expectedFile: "20260902_151726.jpg", file: null }
];

export function AdminEtsyMuscadineDraft({ accessToken, grantedScopes }: {
  accessToken: string;
  grantedScopes: string[];
}) {
  const [preflight, setPreflight] = useState<MuscadineDraftPreflight | null>(null);
  const [readback, setReadback] = useState<MuscadineDraftReadback | null>(null);
  const [images, setImages] = useState<ImageChoice[]>(INITIAL_IMAGES);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const hasWriteScope = grantedScopes.includes("listings_w");
  const allImagesSelected = images.every((image) => image.file);

  async function runPreflight() {
    setBusy(true);
    setMessage("");
    setReadback(null);
    try {
      const response = await fetch("/api/admin/etsy/listings/muscadine-draft", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store"
      });
      const payload = (await response.json()) as MuscadineDraftPreflight & { error?: string };
      if (!response.ok) throw new Error(payload.error || "The Etsy preflight failed.");
      setPreflight(payload);
      setMessage(payload.ready ? "Preflight passed. No Etsy listing has been created yet." : "Preflight stopped before creation.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Etsy preflight failed.");
    } finally {
      setBusy(false);
    }
  }

  function chooseImage(rank: ImageChoice["rank"], file: File | null) {
    setImages((current) => current.map((image) => image.rank === rank ? { ...image, file } : image));
  }

  async function uploadImage(listingId: number, image: ImageChoice) {
    if (!image.file) throw new Error(`Image ${image.rank} was not selected.`);
    const form = new FormData();
    form.append("rank", String(image.rank));
    form.append("image", image.file, image.file.name);
    const response = await fetch(`/api/admin/etsy/listings/muscadine-draft/${listingId}/images`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(payload.error || `Etsy image ${image.rank} could not be uploaded.`);
  }

  async function loadReadback(listingId: number) {
    const response = await fetch(`/api/admin/etsy/listings/muscadine-draft?listingId=${listingId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store"
    });
    const payload = (await response.json()) as MuscadineDraftReadback & { error?: string };
    if (!response.ok) throw new Error(payload.error || "The Etsy draft read-back failed.");
    setReadback(payload);
    return payload;
  }

  async function createDraft() {
    if (!preflight?.ready || confirmation !== CONFIRMATION || !allImagesSelected) return;
    setBusy(true);
    setMessage("Creating the Etsy draft. Nothing will be published.");
    let listingId = 0;
    try {
      const createResponse = await fetch("/api/admin/etsy/listings/muscadine-draft", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ confirmation, fingerprint: preflight.fingerprint })
      });
      const created = (await createResponse.json()) as { listingId?: number; error?: string };
      listingId = Number(created.listingId) || 0;
      if (!createResponse.ok || !listingId) throw new Error(created.error || "Etsy did not create the draft.");

      for (const image of images) await uploadImage(listingId, image);
      const verified = await loadReadback(listingId);
      setMessage(
        verified.state === "draft" && verified.imageCount === 3
          ? `Verified Etsy draft ${listingId}. It remains unpublished.`
          : `Etsy draft ${listingId} needs owner review before any further action.`
      );
    } catch (error) {
      setMessage(
        `${error instanceof Error ? error.message : "The Etsy draft workflow failed."}${listingId ? ` Draft listing ID: ${listingId}.` : ""}`
      );
      if (listingId) {
        try {
          await loadReadback(listingId);
        } catch {
          // Preserve the creation error and listing ID when read-back also fails.
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="field-card overflow-hidden">
      <div className="border-b border-pine/10 p-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-stone">One-time owner action / draft only</p>
        <h2 className="mt-2 text-2xl font-black text-pine">Create Muscadine Grape seed draft</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/70">
          This narrowly scoped workflow creates one new Muscadine draft, configures two disabled zero-quantity pack
          options, and uploads three natural photos. It cannot publish, activate, renew, deactivate, or delete a listing.
        </p>
        <button className="button button-secondary mt-4" onClick={() => void runPreflight()} disabled={busy || !hasWriteScope}>
          {busy ? "Working..." : "Run Muscadine draft preflight"}
        </button>
        {!hasWriteScope ? (
          <p className="mt-3 text-sm font-bold text-rust">Reconnect Etsy with listings_w before using this workflow.</p>
        ) : null}
        {message ? <p className="mt-4 rounded-md bg-sage px-4 py-3 text-sm font-bold text-pine">{message}</p> : null}
      </div>

      {preflight ? (
        <div className="space-y-5 p-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <DraftFact label="Shop" value={`${preflight.shop.shopName} (${preflight.shop.shopId})`} />
            <DraftFact label="Title" value={`${preflight.titleLength} characters`} />
            <DraftFact label="Taxonomy" value={preflight.taxonomy?.path || "Not verified"} />
            <DraftFact label="Reference listing" value={preflight.referenceListing ? `${preflight.referenceListing.title} (${preflight.referenceListing.listingId})` : "Not verified"} />
            <DraftFact label="Shipping profile" value={preflight.shippingProfile ? `${preflight.shippingProfile.title} (${preflight.shippingProfile.id})` : "Not verified"} />
            <DraftFact label="Processing profile" value={preflight.processingProfile ? `${preflight.processingProfile.label} (${preflight.processingProfile.id})` : "Not verified"} />
            <DraftFact label="Final quantities" value="0 and disabled; owner input required" />
            <DraftFact label="Existing exact drafts" value={String(preflight.existingDrafts.length)} />
          </div>

          {preflight.blockers.length > 0 ? (
            <div className="rounded-md border border-rust/30 bg-rust/10 p-4 text-sm font-bold text-rust">
              {preflight.blockers.map((blocker) => <p key={blocker}>{blocker}</p>)}
            </div>
          ) : null}

          {preflight.ready ? (
            <>
              <div className="grid gap-4 lg:grid-cols-3">
                {images.map((image) => (
                  <label key={image.rank} className="rounded-md border border-pine/15 bg-sage/35 p-4 text-sm font-bold text-pine">
                    <span className="block">{image.rank}. {image.label}</span>
                    <span className="mt-1 block text-xs text-stone">Expected: {image.expectedFile}</span>
                    <input
                      className="mt-3 block w-full text-xs"
                      type="file"
                      accept="image/jpeg,.jpg,.jpeg"
                      onChange={(event) => chooseImage(image.rank, event.target.files?.[0] ?? null)}
                    />
                  </label>
                ))}
              </div>

              <label className="block max-w-xl text-sm font-bold text-pine">
                Type <span className="font-black">{CONFIRMATION}</span>
                <input className="admin-input mt-2" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
              </label>
              <button
                className="button button-primary"
                onClick={() => void createDraft()}
                disabled={busy || confirmation !== CONFIRMATION || !allImagesSelected}
              >
                {busy ? "Creating draft..." : "Create unpublished Muscadine draft"}
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {readback ? <MuscadineReadback readback={readback} /> : null}
    </section>
  );
}

function DraftFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-sage/55 p-4">
      <p className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-stone">{label}</p>
      <p className="mt-2 text-sm font-bold text-pine">{value}</p>
    </div>
  );
}

function MuscadineReadback({ readback }: { readback: MuscadineDraftReadback }) {
  return (
    <div className="space-y-5 border-t border-pine/10 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-stone">Fresh Etsy read-back</p>
          <h3 className="mt-2 text-xl font-black text-pine">Draft {readback.listingId}: {readback.state}</h3>
          <p className="mt-2 text-sm font-bold text-pine">{readback.title}</p>
        </div>
        <a className="button button-secondary" href={readback.reviewUrl} target="_blank" rel="noreferrer">
          Review draft on Etsy
        </a>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DraftFact label="Taxonomy" value={readback.taxonomy?.path || "Not returned"} />
        <DraftFact label="Images" value={`${readback.imageCount} uploaded`} />
        <DraftFact label="Shipping" value={readback.shippingProfile?.title || "Not returned"} />
        <DraftFact label="Processing" value={readback.processingProfile?.label || "Not returned"} />
      </div>
      <div className="overflow-x-auto rounded-md border border-pine/10">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-sage/70 text-xs font-black uppercase tracking-[0.12em] text-stone">
            <tr><th className="px-4 py-3">Variation</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Quantity</th><th className="px-4 py-3">Offering</th></tr>
          </thead>
          <tbody className="divide-y divide-pine/10">
            {readback.variations.map((variation) => (
              <tr key={`${variation.productId}-${variation.offeringId}`}>
                <td className="px-4 py-3 font-bold text-pine">{variation.name}</td>
                <td className="px-4 py-3">{new Intl.NumberFormat("en-US", { style: "currency", currency: variation.currencyCode }).format(variation.price)}</td>
                <td className="px-4 py-3">{variation.sku}</td>
                <td className="px-4 py-3">{variation.quantity}</td>
                <td className="px-4 py-3">{variation.isEnabled ? "Enabled" : "Disabled"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="rounded-md bg-sage/40 p-4">
        <summary className="cursor-pointer font-black text-pine">Complete description, tags, materials, and warnings</summary>
        <pre className="mt-4 whitespace-pre-wrap text-sm leading-6 text-ink/75">{readback.description}</pre>
        <p className="mt-4 text-sm"><strong>Tags:</strong> {readback.tags.join(", ")}</p>
        <p className="mt-2 text-sm"><strong>Materials:</strong> {readback.materials.join(", ")}</p>
        <div className="mt-3 text-sm font-bold text-rust">{readback.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>
      </details>
    </div>
  );
}
