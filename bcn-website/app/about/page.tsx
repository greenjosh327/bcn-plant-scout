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
    "Learn about Base Camp North, a small Pennsylvania nursery focused on native trees, seed collection, nursery work, wildlife habitat, and GIS mapping.",
  path: "/about"
});

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
          <SectionHeading as="h1" eyebrow="About Base Camp North" title="About Base Camp North">
            Base Camp North began as a backyard nursery project inspired by emergency
            management: a base camp is where crews rest, recover, and prepare for what comes next.
          </SectionHeading>
          <div className="space-y-5 text-lg leading-8 text-ink/75">
            <p>
              What started with acorns and oak seedlings has grown into a small Pennsylvania
              nursery focused on native trees, nut species, and pollinator plants.
            </p>
            <p>
              Seeds are cleaned, tracked, cold-stratified, and grown with practical nursery
              methods that favor strong roots and local habitat value.
            </p>
            <p>
              The mission is simple: make reforestation and restoration feel reachable,
              one backyard and woodland edge at a time.
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
