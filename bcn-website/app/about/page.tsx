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
    "Learn about Base Camp North, a Pennsylvania native tree nursery focused on locally collected seeds, native seedlings, wildlife food trees, and habitat planting.",
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
          <SectionHeading as="h1" eyebrow="About Base Camp North" title="Native trees, seeds, and habitat plants from Pennsylvania">
            Base Camp North is a small Pennsylvania native nursery founded by Josh Green.
          </SectionHeading>
          <div className="space-y-5 text-lg leading-8 text-ink/75">
            <p>
              Our mission is simple: help people plant more native trees, grow useful habitat, and leave
              the land better than they found it.
            </p>
            <p>
              We focus on native trees, locally collected seeds, wildlife food trees, chestnuts, fruit and
              nut trees, native shrubs, and practical plants for backyards, food plots, homesteads, and
              restoration projects.
            </p>
            <p>
              Many of our seeds are collected directly from healthy local trees throughout Pennsylvania.
              That helps preserve regional genetics while producing plants adapted to our climate,
              seasons, and wildlife.
            </p>
            <p>
              Every seed is cleaned, processed, and stored with care before propagation or packaging.
              Seedlings are grown in quality soil mixes with a focus on strong roots, healthy growth,
              and clear planting guidance.
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
              Base Camp North is built for people who want honest growing information and plants with a
              purpose. Whether you are planting a single crabapple for birds, starting a seed tray, or
              rebuilding habitat across a larger property, we want the process to feel possible.
            </p>
            <p>
              We are still small, seasonal, and hands-on. That means inventory changes, seed lots are
              limited, and each order matters.
            </p>
            <p className="font-black text-pine">
              Plant more. Restore more. Leave the land better than you found it.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="button button-primary" href="/shop">
              Shop Nursery Inventory
            </Link>
            <Link className="button button-secondary" href="/contact">
              Contact BCN
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
