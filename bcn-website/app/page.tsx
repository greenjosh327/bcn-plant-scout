import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { SectionHeading } from "@/components/section-heading";
import { getFeaturedCatalogProducts } from "@/lib/catalog-db";

const reasons = [
  ["Native plants", "Species chosen for local habitat value, not just shelf appeal."],
  ["Responsibly propagated", "Seed, cuttings, and nursery stock handled with careful records."],
  ["Habitat restoration", "Plants that feed pollinators, wildlife, and long-term resilience."],
  ["Small family business", "Grown with field notes, muddy boots, and direct accountability."]
];

export default async function HomePage() {
  const featured = await getFeaturedCatalogProducts();

  return (
    <main>
      <section className="bg-parchment">
        <div className="container grid gap-10 py-12 md:grid-cols-[1.05fr_0.95fr] md:py-20">
          <div className="flex flex-col justify-center">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-stone">
              Base Camp North
            </p>
            <h1 className="mt-5 text-5xl font-black tracking-tight text-pine md:text-7xl">
              Native plants for practical restoration.
            </h1>
            <p className="mt-6 max-w-2xl text-xl leading-9 text-ink/75">
              A Pennsylvania nursery focused on native trees, nut species, pollinator
              plants, seed collection, and GIS-backed field work.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="button button-primary" href="/shop">
                Shop Plants
              </Link>
              <Link className="button button-secondary" href="/gis">
                GIS Services
              </Link>
            </div>
          </div>
          <div className="field-card overflow-hidden bg-white p-4 shadow-soft">
            <div className="relative aspect-[4/5] overflow-hidden rounded-md bg-sage">
              <Image
                src="/images/scout-greenhouse-tools.webp"
                alt="Nursery field kit with greenhouse tools"
                fill
                priority
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="container py-16">
        <SectionHeading eyebrow="Featured inventory" title="Plants, cuttings, and seeds">
          Start with nursery stock that fits woodland edges, wildlife plantings, food
          forests, and backyard restoration projects.
        </SectionHeading>
        <div className="grid gap-6 md:grid-cols-3">
          {featured.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="container py-8">
        <div className="grid gap-4 md:grid-cols-4">
          {reasons.map(([title, text]) => (
            <article key={title} className="field-card p-6">
              <h3 className="text-xl font-black text-pine">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-ink/70">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container py-16">
        <div className="grid gap-8 rounded-lg bg-pine p-8 text-white md:grid-cols-[1fr_0.8fr] md:p-12">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-sage">
              GIS Services
            </p>
            <h2 className="mt-3 text-4xl font-black">Maps for the work after planting.</h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-sage">
              Property maps, habitat planning, invasive species surveys, and field
              data workflows for restoration projects and land stewardship.
            </p>
            <Link className="button mt-7 bg-white text-pine" href="/gis">
              Explore GIS Services
            </Link>
          </div>
          <div className="relative min-h-64 overflow-hidden rounded-md">
            <Image src="/images/scout-field-map.webp" alt="Field map and scouting tools" fill className="object-cover" />
          </div>
        </div>
      </section>

      <section className="container py-12">
        <SectionHeading eyebrow="Latest articles" title="Field notes coming soon">
          Propagation notes, seed timing, native plant profiles, and restoration lessons
          will live here as the nursery grows.
        </SectionHeading>
      </section>
    </main>
  );
}
