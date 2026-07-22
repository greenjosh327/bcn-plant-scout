import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { SectionHeading } from "@/components/section-heading";
import { buildPageMetadata } from "@/lib/seo";
import { buildBreadcrumbList } from "@/lib/structured-data";

export const metadata: Metadata = buildPageMetadata({
  title: "About Base Camp North",
  description:
    "Learn about Base Camp North, a Pennsylvania native tree nursery focused on native seedlings, locally collected seeds, wildlife habitat, and conservation technology.",
  path: "/about"
});

const specialties = [
  "Native tree seedlings",
  "Bare-root trees",
  "Locally collected seeds",
  "Wildlife food trees",
  "Chestnuts",
  "Fruit and nut trees",
  "Native shrubs",
  "Habitat restoration"
];

export default function AboutPage() {
  return (
    <main className="container py-12">
      <JsonLd
        data={buildBreadcrumbList([
          { name: "Home", path: "/" },
          { name: "About", path: "/about" }
        ])}
      />
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-sage">
          <Image src="/images/scout-field-kit.webp" alt="Base Camp North field notebook and seed collection tools" fill className="object-cover" />
        </div>
        <section>
          <SectionHeading as="h1" eyebrow="About Base Camp North" title="Pennsylvania native trees for habitat restoration">
            Base Camp North is a Pennsylvania-based native tree nursery founded by Josh Green.
          </SectionHeading>
          <div className="space-y-5 text-lg leading-8 text-ink/75">
            <p>
              Our mission is simple: help people plant more native trees and restore wildlife habitat.
            </p>
            <p>
              Unlike large commercial nurseries, many of our seeds are collected directly from healthy
              local trees throughout Pennsylvania. That helps preserve regional genetics while producing
              hardy plants adapted to our climate.
            </p>
            <p>
              Every seed is cleaned, processed, and stored properly before propagation or packaging.
              Seedlings are grown with quality soil mixes and sustainable practices designed to produce
              healthy root systems.
            </p>
          </div>

          <div className="mt-8">
            <h2 className="text-2xl font-black text-pine">What we grow and support</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {specialties.map((item) => (
                <li key={item} className="rounded-md bg-sage/55 px-4 py-3 font-bold text-pine">
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 space-y-5 text-lg leading-8 text-ink/75">
            <p>
              Base Camp North also develops technology for the conservation community, including the
              BCN Plant Scout app, which helps users identify, map, and revisit important plants in the field.
            </p>
            <p>
              Whether you are planting a single tree or restoring hundreds of acres, we are here to help.
            </p>
            <p className="font-black text-pine">
              Plant more. Restore more. Leave the land better than you found it.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="button button-primary" href="/shop">
              Shop Nursery Inventory
            </Link>
            <Link className="button button-secondary" href="/gis">
              Explore GIS Services
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
