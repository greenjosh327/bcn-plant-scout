import Image from "next/image";
import { SectionHeading } from "@/components/section-heading";

export default function AboutPage() {
  return (
    <main className="container py-12">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-sage">
          <Image src="/images/scout-field-kit.webp" alt="Base Camp North field notebook and seed collection tools" fill className="object-cover" />
        </div>
        <section>
          <SectionHeading eyebrow="About Base Camp North" title="Growth after the storm">
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
        </section>
      </div>
    </main>
  );
}
