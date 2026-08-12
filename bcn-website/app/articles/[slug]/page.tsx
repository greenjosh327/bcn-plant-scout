import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { articles, getArticleBySlug, type FieldArticleSection } from "@/lib/articles";
import { buildNoindexMetadata, buildPageMetadata } from "@/lib/seo";
import { buildArticlePageStructuredData } from "@/lib/structured-data";

type ArticlePageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const article = getArticleBySlug(resolvedParams.slug);

  if (!article) return buildNoindexMetadata();

  return buildPageMetadata({
    title: article.title,
    description: article.description,
    path: `/articles/${article.slug}`
  });
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const resolvedParams = await params;
  const article = getArticleBySlug(resolvedParams.slug);
  if (!article) notFound();

  return (
    <main className="container py-12">
      <JsonLd data={buildArticlePageStructuredData(article)} />

      <article className="mx-auto max-w-4xl">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-stone">Field guide</p>
        <h1 className="mt-3 text-5xl font-black tracking-tight text-pine md:text-6xl">{article.title}</h1>
        <p className="mt-5 max-w-3xl text-xl leading-9 text-ink/75">{article.description}</p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.16em] text-stone">
          <span>{formatArticleDate(article.publishedAt)}</span>
          <span>/</span>
          <span>{article.readingMinutes} min read</span>
        </div>

        <div className="relative mt-8 aspect-[16/10] overflow-hidden rounded-lg bg-sage">
          <Image src={article.heroImage} alt={article.heroAlt} fill priority sizes="(min-width: 1024px) 896px, calc(100vw - 32px)" className="object-cover" />
        </div>

        <div className="mt-10 grid gap-8">
          {article.sections.map((section) => (
            <ArticleSection key={section.title} section={section} />
          ))}
        </div>

        <div className="mt-12 rounded-lg bg-pine p-6 text-white md:p-8">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sage">Start scouting</p>
          <h2 className="mt-3 text-3xl font-black">Create useful field records while you are outside.</h2>
          <p className="mt-4 max-w-2xl leading-7 text-sage">
            Open BCN Plant Scout before your next woods walk and save the plants, seed crops, and habitat observations you want to revisit.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="button bg-white text-pine" href="https://scout.basecampnorthpa.com">
              Open Plant Scout
            </Link>
            <Link className="button button-secondary" href="/articles">
              More Articles
            </Link>
          </div>
        </div>
      </article>
    </main>
  );
}

function ArticleSection({ section }: { section: FieldArticleSection }) {
  return (
    <section className="field-card p-6 md:p-8">
      <h2 className="text-3xl font-black tracking-tight text-pine">{section.title}</h2>
      <div className="mt-5 space-y-4 text-lg leading-8 text-ink/75">
        {section.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      {section.bullets ? (
        <ul className="mt-5 grid gap-3 text-ink/75">
          {section.bullets.map((item) => (
            <li key={item} className="rounded-md bg-sage/55 px-4 py-3 leading-7">
              {item}
            </li>
          ))}
        </ul>
      ) : null}
      {section.examples ? (
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          {section.examples.map((example) => (
            <div key={example.label} className="rounded-md bg-sage/55 px-4 py-3">
              <dt className="text-xs font-black uppercase tracking-[0.16em] text-stone">{example.label}</dt>
              <dd className="mt-1 font-bold text-pine">{example.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {section.links ? (
        <div className="mt-5 grid gap-3">
          {section.links.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-md border border-pine/15 bg-sage/45 px-4 py-3 transition hover:border-rust/50 hover:bg-white">
              <span className="block font-black text-pine">{link.label}</span>
              <span className="mt-1 block text-sm leading-6 text-ink/70">{link.description}</span>
              <span className="mt-2 block break-words text-sm font-bold text-rust">{link.href}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function formatArticleDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00.000Z`));
}
