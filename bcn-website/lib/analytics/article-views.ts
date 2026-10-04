import { articles } from "@/lib/articles";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export type ArticleViewCount = {
  slug: string;
  path: string;
  uniqueViews: number;
};

type ArticleViewStatsRow = {
  article_slug: string | null;
  unique_views: number | string | null;
};

export function normalizeArticleViewCounts(rows: ArticleViewStatsRow[]): ArticleViewCount[] {
  const counts = new Map<string, number>();

  rows.forEach((row) => {
    if (!row.article_slug) return;
    const count = Number(row.unique_views);
    counts.set(row.article_slug, Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0);
  });

  return articles.map((article) => ({
    slug: article.slug,
    path: `/articles/${article.slug}`,
    uniqueViews: counts.get(article.slug) ?? 0
  }));
}

export async function loadArticleViewCounts() {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("article_view_stats")
    .select("article_slug, unique_views");

  if (error) {
    throw new Error(`Article view counts could not be loaded: ${error.message}`);
  }

  return normalizeArticleViewCounts((data ?? []) as ArticleViewStatsRow[]);
}

export function articleViewCountMap(counts: ArticleViewCount[]) {
  return new Map(counts.map((article) => [article.slug, article.uniqueViews]));
}

export function formatArticleViewCount(count: number) {
  return `${count} ${count === 1 ? "view" : "views"}`;
}
