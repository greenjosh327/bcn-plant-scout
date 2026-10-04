import { NextResponse } from "next/server";
import { loadArticleViewCounts } from "@/lib/analytics/article-views";

export const runtime = "nodejs";

export async function GET() {
  try {
    const articles = await loadArticleViewCounts();
    return NextResponse.json(
      { articles, generatedAt: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300"
        }
      }
    );
  } catch (error) {
    console.error("Public article view counts could not be loaded.", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return NextResponse.json({ error: "Article view counts could not be loaded." }, { status: 500 });
  }
}
