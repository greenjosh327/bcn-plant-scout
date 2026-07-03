import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/product-card";
import { getProductBySlug, getRelatedProducts, products } from "@/lib/products";

export function generateStaticParams() {
  return products.map((product) => ({ slug: product.slug }));
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const product = getProductBySlug(resolvedParams.slug);
  if (!product) notFound();

  const related = getRelatedProducts(product);
  const facts = [
    ["Hardiness", product.hardinessZones],
    ["Sun", product.sunlight],
    ["Soil", product.soil],
    ["Bloom", product.bloomTime],
    ["Height", product.height],
    ["Spacing", product.spread],
    ["Native range", product.nativeStatus],
    ["Local pickup", product.localPickup ? "Available" : "Not available"],
    ["Shipping", product.ships ? "Available" : "Pickup only"]
  ];

  return (
    <main className="container py-12">
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
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <p className="text-3xl font-black text-pine">${product.price}</p>
            <p className="rounded-full bg-sage px-4 py-2 text-sm font-black text-pine">
              {product.inventory > 0 ? `${product.inventory} in stock` : "Sold out"}
            </p>
          </div>
          <button className="button button-primary mt-8 w-full md:w-auto" disabled={product.inventory === 0}>
            {product.inventory > 0 ? "Add to Cart" : "Sold Out"}
          </button>
          <p className="mt-3 text-sm text-stone">Checkout is prepared for Stripe, but live payment is not enabled yet.</p>
        </section>
      </div>

      <section className="mt-16 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="field-card p-6">
          <h2 className="text-2xl font-black text-pine">Growing information</h2>
          <div className="mt-5 grid gap-3">
            {facts.map(([label, value]) => (
              <div key={label} className="rounded-md bg-sage/55 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-stone">{label}</p>
                <p className="mt-1 font-bold text-pine">{value}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-5">
          <InfoBlock title="Wildlife value">{product.wildlifeBenefits}</InfoBlock>
          <InfoBlock title="Pollinator value">{product.pollinatorBenefits}</InfoBlock>
          <InfoBlock title="Host plant information">{product.hostSpecies}</InfoBlock>
          <InfoBlock title="Growing notes">{product.growingNotes}</InfoBlock>
          <InfoBlock title="Shipping notes">{product.shippingNotes}</InfoBlock>
        </div>
      </section>

      <section className="mt-16">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 className="text-3xl font-black text-pine">Related products</h2>
          <Link href="/shop" className="font-black text-rust">Back to shop</Link>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {related.map((item) => <ProductCard key={item.id} product={item} />)}
        </div>
      </section>
    </main>
  );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="field-card p-6">
      <h3 className="text-xl font-black text-pine">{title}</h3>
      <p className="mt-3 leading-7 text-ink/75">{children}</p>
    </article>
  );
}
