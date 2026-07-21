import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { contactEmails, mailto } from "@/lib/contact";
import { buildPageMetadata } from "@/lib/seo";
import { buildBreadcrumbList } from "@/lib/structured-data";

export const metadata: Metadata = buildPageMetadata({
  title: "Contact Base Camp North",
  description:
    "Contact Base Camp North about nursery products, tree seeds, orders, shipping, GIS services, or BCN Plant Scout app support.",
  path: "/contact"
});

type ContactOption = {
  eyebrow: string;
  title: string;
  description: string;
  email: string;
  subject: string;
  action: string;
};

const contactOptions: ContactOption[] = [
  {
    eyebrow: "General contact",
    title: "General questions",
    description:
      "Use this for general Base Camp North questions, website notes, local pickup coordination before an order, or anything that does not fit another box.",
    email: contactEmails.general,
    subject: "General Base Camp North question",
    action: "Email General Contact"
  },
  {
    eyebrow: "Sales and nursery",
    title: "Plants, quotes, and wholesale",
    description:
      "Use this for nursery availability, product sales, larger planting lists, wholesale requests, custom seed or tree questions, and quote requests.",
    email: contactEmails.sales,
    subject: "Sales, nursery, or quote request",
    action: "Email Sales"
  },
  {
    eyebrow: "Orders and shipping",
    title: "Existing order help",
    description:
      "Use this for order confirmations, shipping questions, tracking, pickup changes, or a question about something you already ordered.",
    email: contactEmails.orders,
    subject: "Order or shipping question",
    action: "Email Orders"
  },
  {
    eyebrow: "App support",
    title: "BCN Plant Scout support",
    description:
      "Use this for Plant Scout sign-in help, synced record questions, account deletion help, bug reports, or app support.",
    email: contactEmails.support,
    subject: "BCN Plant Scout support",
    action: "Email Support"
  }
];

export default function ContactPage() {
  return (
    <main className="container py-12">
      <JsonLd
        data={buildBreadcrumbList([
          { name: "Home", path: "/" },
          { name: "Contact", path: "/contact" }
        ])}
      />
      <section className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-stone">Contact</p>
          <h1 className="mt-3 text-5xl font-black tracking-tight text-pine">Reach the right BCN inbox.</h1>
          <p className="mt-5 text-lg leading-8 text-ink/75">
            Pick the closest fit below and your message will open in email. A direct email is the most reliable
            option right now while the shop, shipping, and Plant Scout pieces are being tightened up.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="button button-secondary" href="/shop">
              Browse Shop
            </Link>
            <Link className="button button-secondary" href="/gis">
              GIS Services
            </Link>
            <Link className="button button-secondary" href="https://scout.basecampnorthpa.com/support">
              Plant Scout Support
            </Link>
          </div>

          <div className="mt-8 field-card p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-stone">Pickup and visits</p>
            <h2 className="mt-2 text-2xl font-black text-pine">Local pickup is by appointment.</h2>
            <p className="mt-3 leading-7 text-ink/75">
              For plant pickup, order changes, or seasonal availability, email first so the right items can be
              confirmed before you drive over.
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          {contactOptions.map((option) => (
            <ContactCard key={option.email} option={option} />
          ))}
        </div>
      </section>
    </main>
  );
}

function ContactCard({ option }: { option: ContactOption }) {
  return (
    <article className="field-card p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-stone">{option.eyebrow}</p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-black text-pine">{option.title}</h2>
          <p className="mt-3 max-w-2xl leading-7 text-ink/75">{option.description}</p>
          <p className="mt-3 font-black text-pine">{option.email}</p>
        </div>
        <a className="button button-primary shrink-0" href={mailto(option.email, option.subject)}>
          {option.action}
        </a>
      </div>
    </article>
  );
}
