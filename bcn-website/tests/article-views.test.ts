import assert from "node:assert/strict";
import test from "node:test";
import { formatArticleViewCount, normalizeArticleViewCounts } from "@/lib/analytics/article-views";
import { articles } from "@/lib/articles";

test("article view statistics are normalized for all configured articles", () => {
  const [first, second] = articles;
  const result = normalizeArticleViewCounts([
    { article_slug: first.slug, unique_views: "12" },
    { article_slug: second.slug, unique_views: -3 },
    { article_slug: "not-a-public-article", unique_views: 99 },
    { article_slug: null, unique_views: 8 }
  ]);

  assert.equal(result.length, articles.length);
  assert.deepEqual(result[0], {
    slug: first.slug,
    path: `/articles/${first.slug}`,
    uniqueViews: 12
  });
  assert.equal(result[1].uniqueViews, 0);
  assert.equal(result[2].uniqueViews, 0);
  assert.equal(result.some((article) => article.slug === "not-a-public-article"), false);
});

test("article view labels use singular and plural forms", () => {
  assert.equal(formatArticleViewCount(1), "1 view");
  assert.equal(formatArticleViewCount(0), "0 views");
  assert.equal(formatArticleViewCount(12), "12 views");
});
