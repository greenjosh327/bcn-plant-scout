import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GoogleEcommerceTracker } from "@/components/google-ecommerce-tracker";
import { ProductCard } from "@/components/product-card";
import { ProductPurchasePanel } from "@/components/product-purchase-panel";
import { getCatalogProductBySlug, getRelatedCatalogProducts } from "@/lib/catalog-db";
import { productToGoogleAnalyticsItem } from "@/lib/marketing/google-analytics";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const product = await getCatalogProductBySlug(resolvedParams.slug);
  if (!product) notFound();

  const related = await getRelatedCatalogProducts(product);
  const growingFacts = [
    { label: "Hardiness", value: product.hardinessZones, enabled: product.showHardinessZones !== false },
    { label: "Sun", value: product.sunlight, enabled: product.showSunlight !== false },
    { label: "Soil", value: product.soil, enabled: product.showSoil !== false },
    { label: "Bloom or harvest season", value: product.bloomTime, enabled: product.showBloomTime !== false },
    { label: "Mature height", value: product.height, enabled: product.showHeight !== false },
    { label: "Spacing", value: product.spread, enabled: product.showSpread !== false },
    { label: "Native range", value: product.nativeStatus, enabled: product.showNativeStatus !== false },
    { label: "Wildlife value", value: product.wildlifeBenefits, enabled: product.showWildlifeBenefits !== false },
    { label: "Pollinator value", value: product.pollinatorBenefits, enabled: product.showPollinatorBenefits !== false },
    { label: "Host plant information", value: product.hostSpecies, enabled: product.showHostSpecies !== false }
  ]
    .map((fact) => ({ ...fact, value: displayValue(fact.value) }))
    .filter((fact) => fact.enabled && fact.value);

  const growingDetailBlocks = [
    { title: "Growing notes", value: displayValue(product.growingNotes) },
    { title: "Planting or germination instructions", value: displayValue(product.plantingInstructions) },
    { title: "Shipping notes", value: displayValue(product.shippingNotes) }
  ].filter((block) => block.value);

  const hasGrowingInformation = growingFacts.length > 0 || growingDetailBlocks.length > 0;
  const showSeedShippingNote = product.shippingClass === "seed_envelope";
  const growingSectionClass =
    growingFacts.length > 0 && growingDetailBlocks.length > 0
      ? "mt-16 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]"
      : "mt-16 grid gap-6";

  return (
    <main className="container py-12">
      <GoogleEcommerceTracker
        eventName="view_item"
        params={{
          currency: "USD",
          value: product.price,
          items: [productToGoogleAnalyticsItem(product)]
        }}
      />
      <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="grid gap-4">
          {product.images.map((image) => (
            <div key={image} className="relative aspect-[4/3] overflow-hidden rounded-lg bg-sage">
              <Image src={image} alt={product.name} fill className="object-cover" />
            </div>
          ))}
        </div>
        <section>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-stone">{product.category}</p>
          <h1 className="mt-3 text-5xl font-black tracking-tight text-pine">{product.name}</h1>
          <p className="mt-2 text-xl italic text-stone">{product.scientificName}</p>
          <p className="mt-6 text-lg leading-8 text-ink/75">{product.description}</p>
          {product.variations && product.variations.length > 0 ? (
            <div className="mt-8 field-card p-4">
              <h2 className="text-lg font-black text-pine">Available options</h2>
              <div className="mt-4 grid gap-3">
                {product.variations.map((variation) => (
                  <div key={`${variation.sku}-${variation.name}`} className="flex items-start justify-between gap-4 rounded-md bg-sage/55 p-4">
                    <div>
                      <p className="font-black text-pine">{variation.name}</p>
                      {variation.sku ? <p className="mt-1 text-xs font-bold text-stone">SKU {variation.sku}</p> : null}
                    </div>
                    <div className="text-right">
                      <p className="font-black text-pine">${variation.price}</p>
                      <p className="mt-1 text-xs font-bold text-stone">
                        {variation.inventory > 0 ? `${variation.inventory} available` : "Sold out"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <ProductPurchasePanel product={product} />
          {showSeedShippingNote ? (
            <p className="mt-4 rounded-md bg-sage/60 p-4 text-sm font-bold leading-6 text-stone">
              Seed packets can ship by $2 Economy Seed Mail without tracking when they fit in one envelope. Tracked USPS options are available at checkout, and up to 12 seed packets usually fit in one envelope.
            </p>
          ) : null}
          <p className="mt-3 text-sm text-stone">Checkout runs through Stripe. Pickup and shipping options are checked before payment.</p>
        </section>
      </div>

      {hasGrowingInformation ? (
        <section className={growingSectionClass}>
          {growingFacts.length > 0 ? (
            <div className="field-card p-6">
              <h2 className="text-2xl font-black text-pine">Growing information</h2>
              <div className="mt-5 grid gap-3">
                {growingFacts.map((fact) => (
                  <div key={fact.label} className="rounded-md bg-sage/55 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-stone">{fact.label}</p>
                    <p className="mt-1 font-bold text-pine">{fact.value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {growingDetailBlocks.length > 0 ? (
            <div className="grid gap-5">
              {growingDetailBlocks.map((block) => (
                <InfoBlock key={block.title} title={block.title}>{block.value}</InfoBlock>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {related.length > 0 ? (
        <section className="mt-16">
          <div className="mb-6 flex items-end justify-between gap-4">
            <h2 className="text-3xl font-black text-pine">Related products</h2>
            <Link href="/shop" className="font-black text-rust">Back to shop</Link>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {related.map((item) => <ProductCard key={item.id} product={item} />)}
          </div>
        </section>
      ) : null}
    </main>
  );
}

const HIDDEN_PLACEHOLDER_VALUES = new Set([
  "See product description",
  "See product description for bloom and pollinator notes.",
  "Selected for nursery, wildlife, food forest, or restoration value.",
  "Shipping and pickup availability depends on item size, season, and live-plant condition."
]);

function displayValue(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || HIDDEN_PLACEHOLDER_VALUES.has(trimmed)) return "";
  return trimmed;
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="field-card p-6">
      <h3 className="text-xl font-black text-pine">{title}</h3>
      <p className="mt-3 leading-7 text-ink/75">{children}</p>
    </article>
  );
}
