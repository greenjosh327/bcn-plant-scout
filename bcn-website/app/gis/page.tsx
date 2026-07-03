import Link from "next/link";
import { SectionHeading } from "@/components/section-heading";

const services = [
  ["Habitat Restoration Mapping", "Plan plantings, monitor progress, and keep restoration work tied to real places."],
  ["Property Mapping", "Simple maps for trails, nursery beds, collection zones, and access routes."],
  ["Invasive Species Surveys", "Field-ready mapping for treatment areas, follow-up visits, and reporting."],
  ["Drone Mapping", "Future support for imagery-backed project review and progress mapping."],
  ["Emergency Management GIS", "Practical mapping support built from emergency management field experience."],
  ["Custom GIS Projects", "Small, focused GIS help for landowners, nonprofits, and local projects."]
];

export default function GisPage() {
  return (
    <main className="container py-12">
      <SectionHeading eyebrow="GIS Services" title="Field maps for land work">
        Base Camp North GIS services are being shaped around habitat restoration,
        nursery operations, property mapping, and practical field workflows.
      </SectionHeading>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {services.map(([title, text]) => (
          <article key={title} className="field-card p-6">
            <h2 className="text-2xl font-black text-pine">{title}</h2>
            <p className="mt-4 leading-7 text-ink/72">{text}</p>
          </article>
        ))}
      </div>
      <Link href="/contact" className="button button-primary mt-8">
        Contact Us About GIS Services
      </Link>
    </main>
  );
}
