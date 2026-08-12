export type FieldArticleSection = {
  title: string;
  body: string[];
  bullets?: string[];
  examples?: Array<{
    label: string;
    value: string;
  }>;
};

export type FieldArticle = {
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  publishedAt: string;
  updatedAt: string;
  readingMinutes: number;
  heroImage: string;
  heroAlt: string;
  tags: string[];
  sections: FieldArticleSection[];
};

export const articles: FieldArticle[] = [
  {
    slug: "how-to-use-bcn-plant-scout-in-the-field",
    title: "How to Use BCN Plant Scout in the Field",
    description:
      "Turn a walk in the woods into useful field records for native plants, seed collection, and future habitat work.",
    excerpt:
      "A practical guide to recording plants, seed crops, and return-visit notes with BCN Plant Scout while you are in the field.",
    publishedAt: "2026-08-11",
    updatedAt: "2026-08-11",
    readingMinutes: 6,
    heroImage: "/images/scout-field-kit.webp",
    heroAlt: "Base Camp North field notebook and seed collection tools",
    tags: ["Plant Scout", "Field notes", "Seed collection", "Habitat restoration"],
    sections: [
      {
        title: "Why field records matter",
        body: [
          "If you spend enough time outdoors, you eventually start noticing individual plants worth remembering.",
          "Maybe it is a stand of native shrubs along a wet edge. Maybe it is an oak producing a heavy crop of acorns. Or maybe you found a plant you want to revisit later when fruit or seed is mature.",
          "The hard part is remembering exactly where it was and what you saw when you were there. BCN Plant Scout was built for that."
        ]
      },
      {
        title: "What should you record?",
        body: [
          "You do not need to document every plant you walk past. Plant Scout is most useful when you find something you may want to return to, identify later, or compare across seasons.",
          "Think of each record as a field note with a location attached to it."
        ],
        bullets: [
          "A native tree with a strong seed crop",
          "Oaks you want to revisit during acorn season",
          "Native shrubs producing flowers or fruit",
          "Plants you want to identify more carefully later",
          "Potential seed collection locations",
          "Interesting native plant populations",
          "Restoration or habitat observations",
          "A site that changes through the growing season"
        ]
      },
      {
        title: "1. Open Plant Scout before the moment passes",
        body: [
          "Open BCN Plant Scout on your phone before heading into the field, or as soon as you find something worth recording.",
          "Because the app is designed around field observations, your phone becomes the quickest way to create a record while you are still near the plant."
        ]
      },
      {
        title: "2. Record the plant where you find it",
        body: [
          "Whenever possible, create the record while you are still at the site. Location is one of the most valuable parts of a field observation.",
          "A note like \"large white oak with heavy acorn crop\" is useful. That same note tied to the actual location is much more useful."
        ]
      },
      {
        title: "3. Add simple, useful notes",
        body: [
          "You do not need to write a botanical report. Record enough detail so the observation makes sense when you look at it weeks or months later.",
          "Short, consistent notes are often more useful than long paragraphs you never finish."
        ],
        examples: [
          { label: "Species", value: "White oak" },
          { label: "Observation", value: "Heavy acorn crop" },
          { label: "Site", value: "South-facing woodland edge" },
          { label: "Condition", value: "Mature, healthy tree" },
          { label: "Return", value: "Check again in late September" }
        ]
      },
      {
        title: "4. Plan to return when timing matters",
        body: [
          "One of the best ways to use Plant Scout is to separate finding a plant from returning when the timing is right.",
          "Finding an oak in June does not mean acorns are ready. Finding a native shrub while it is flowering does not mean its seed is mature. Your first visit establishes the location. Later visits tell the rest of the story.",
          "Did the fruit develop? Did wildlife get there first? Did seed mature earlier than expected? Is the plant still healthy? Is the site worth checking again next year?"
        ]
      },
      {
        title: "5. Build your own field knowledge",
        body: [
          "Plant Scout is not only about identifying plants. It is about learning places.",
          "Over time, your records can help you understand when certain species flower, when seed begins to mature, which individual trees produce well, and which locations deserve another visit.",
          "That kind of local knowledge can support native seed collection, propagation, habitat restoration, nursery work, and simply becoming a better observer of the landscape around you."
        ]
      },
      {
        title: "Field tips",
        body: [
          "A few small habits make field records much more useful later."
        ],
        bullets: [
          "Record the location immediately, before you leave the site.",
          "Keep notes simple and clear.",
          "Record what you actually see. If you are not certain about the species, say so.",
          "Include timing clues such as flowers, immature fruit, ripe fruit, fallen seed, or fall color.",
          "Revisit good locations across multiple visits or seasons.",
          "Respect the site. A Plant Scout record is not permission to collect. Follow property rules, get permission where required, and use responsible seed-collection practices."
        ]
      },
      {
        title: "From observation to future plants",
        body: [
          "Base Camp North is built around a simple idea: better field observations can lead to better decisions about native plants and habitat.",
          "Find something interesting. Record where it is. Write down what you see. Come back when the time is right.",
          "Over time, those individual observations can become real knowledge about the native plants growing around you."
        ]
      }
    ]
  }
];

export function getArticleBySlug(slug: string) {
  return articles.find((article) => article.slug === slug) ?? null;
}

export function getFeaturedArticles(limit = 3) {
  return articles.slice(0, limit);
}
