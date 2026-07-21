import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

// Re-enable indexing after real article routes replace the placeholder cards below.
export const metadata: Metadata = buildPageMetadata({
  title: "Field Notes Coming Soon",
  description:
    "Base Camp North field notes are not published yet. Future articles will cover nursery work, propagation notes, seed timing, and habitat planting.",
  path: "/articles",
  robots: {
    index: false,
    follow: false
  }
});

const articlePlaceholders = [
  "When to collect acorns in Pennsylvania",
  "How to think about return-later field notes",
  "Native shrubs for wet edges and pollinator rows"
];

export default function ArticlesPage() {
  return (
    <main className="container py-12">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-stone">Articles</p>
      <h1 className="mt-3 text-5xl font-black text-pine">Field notes coming soon</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {articlePlaceholders.map((title) => (
          <article key={title} className="field-card p-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-stone">Draft</p>
            <h2 className="mt-3 text-2xl font-black text-pine">{title}</h2>
            <p className="mt-4 text-sm leading-6 text-ink/70">
              Placeholder for future educational articles and nursery updates.
            </p>
          </article>
        ))}
      </div>
    </main>
  );
}
