import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { SectionHeading } from "@/components/section-heading";
import { articles } from "@/lib/articles";
import { buildPageMetadata } from "@/lib/seo";
import { buildBreadcrumbList } from "@/lib/structured-data";

export const metadata: Metadata = buildPageMetadata({
  title: "Base Camp North Articles and Field Notes",
  description:
    "Field notes from Base Camp North covering native plants, seed collection, Plant Scout records, propagation, and habitat planting.",
  path: "/articles"
});

export default function ArticlesPage() {
  return (
    <main className="container py-12">
      <JsonLd
        data={buildBreadcrumbList([
          { name: "Home", path: "/" },
          { name: "Articles", path: "/articles" }
        ])}
      />
      <SectionHeading as="h1" eyebrow="Articles" title="Field notes and growing guides">
        Practical notes from Base Camp North on native plants, seed timing, field records, propagation, and habitat work.
      </SectionHeading>

      <div className="grid gap-6 md:grid-cols-3">
        {articles.map((article) => (
          <Link key={article.slug} href={`/articles/${article.slug}`} className="field-card block overflow-hidden transition hover:border-rust/50 hover:bg-white">
            <div className="relative aspect-[4/3] bg-sage">
              <Image src={article.heroImage} alt={article.heroAlt} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" />
            </div>
            <div className="p-6">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-stone">
                {formatArticleDate(article.publishedAt)} / {article.readingMinutes} min read
              </p>
              <h2 className="mt-3 text-2xl font-black text-pine">{article.title}</h2>
              <p className="mt-4 text-sm leading-6 text-ink/70">{article.excerpt}</p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}

function formatArticleDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00.000Z`));
}
