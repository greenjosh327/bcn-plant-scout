export type FieldArticleSection = {
  title: string;
  body: string[];
  bullets?: string[];
  examples?: Array<{
    label: string;
    value: string;
  }>;
  links?: Array<{
    label: string;
    href: string;
    description: string;
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
    heroImage: "/images/articles/plant-scout-field-records.png",
    heroAlt: "Phone, field notebook, and native seed pods at a woodland edge",
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
  },
  {
    slug: "just-ask-permission-to-gather-seeds-fruit-berries-and-nuts",
    title: "Just Ask: Gathering Seeds, Fruit, Berries, and Nuts with Permission",
    description:
      "A simple, respectful approach to asking landowners for permission before collecting seeds, fruit, berries, nuts, or other plant material.",
    excerpt:
      "That tree full of acorns, apples, berries, or native seed might be exactly what you are looking for. Sometimes the best next step is to knock, explain, and ask.",
    publishedAt: "2026-08-11",
    updatedAt: "2026-08-11",
    readingMinutes: 7,
    heroImage: "/images/articles/just-ask-permission-seed-collection.png",
    heroAlt: "Permission-first seed collection at a rural Pennsylvania property",
    tags: ["Seed collection", "Permission", "Native plants", "Field notes"],
    sections: [
      {
        title: "The hard part is often the door",
        body: [
          "You see it from the road: an old oak dropping acorns across a lawn, a crabapple loaded with fruit, a black walnut along a driveway, or a native shrub covered in berries.",
          "You immediately think, \"I would love to collect some of that.\" Then comes the harder thought: \"I would have to ask.\"",
          "That hesitation is normal. Walking up to a stranger's house and asking permission can feel awkward. But if the plant is on private property, asking is the line between responsible collecting and taking something that is not yours."
        ]
      },
      {
        title: "Permission starts with a conversation",
        body: [
          "There is an important difference between seeing something and having permission to collect it. A tree may be dropping more nuts than anyone wants to rake. Fruit may be falling faster than anyone can use it. Berries may appear completely unwanted.",
          "If it is on private property, it belongs to someone. Do not assume. Ask.",
          "The conversation also gives you a chance to explain why you are interested. Maybe you are collecting native seed for propagation, growing trees, preserving local genetics, or working on habitat plantings."
        ],
        examples: [
          {
            label: "Simple ask",
            value: "Hi, I am sorry to bother you. I noticed the oak on your property has a strong acorn crop this year. I grow native trees locally, and I wondered if you would mind if I picked up some acorns underneath it."
          }
        ]
      },
      {
        title: "Respect the answer",
        body: [
          "Sometimes they say yes. Sometimes they say no. Either answer is fine.",
          "If they say no, smile and thank them for their time. Do not argue, pressure them, or try to convince them after they have answered. A respectful no is the end of the conversation.",
          "You did not have those acorns, berries, nuts, or fruit before you asked, and you still do not have them afterward. That is okay. There will always be another tree."
        ]
      },
      {
        title: "When they say yes",
        body: [
          "A homeowner may look at you like you are doing them a favor. Anyone who has had black walnuts dropping across a driveway can understand why.",
          "Sometimes the conversation goes beyond simple permission. The landowner may tell you who planted the tree, how old it is, how often it produces heavily, or where another good tree is growing out back.",
          "Suddenly, you have gained more than a bucket of seeds. You have gained knowledge about the plant and the place where it grows."
        ]
      },
      {
        title: "Be a good guest",
        body: [
          "Getting a yes is permission to do what you asked. It is not permission to wander the whole property, collect from other plants, block a driveway, damage landscaping, or overstay your welcome.",
          "If you asked to collect acorns under one oak, collect there. If they told you to stay along the driveway, stay along the driveway.",
          "Leave the place exactly as you found it, or better. Thank the person before you leave."
        ],
        bullets: [
          "Do not block vehicles or gates.",
          "Do not leave gates open.",
          "Do not break branches unnecessarily.",
          "Do not leave trash.",
          "Do not turn a five-minute collection into an hour-long expedition unless they clearly invited that."
        ]
      },
      {
        title: "Do not be greedy",
        body: [
          "Permission to collect does not mean you should take everything. That matters even more when you are collecting native seed, berries, nuts, or fruit that wildlife also uses.",
          "Take what you can realistically clean, store, plant, or use. Leave plenty behind.",
          "Responsible collection is not about getting every last seed. It is about collecting enough for your purpose without stripping a plant or abusing someone's generosity."
        ]
      },
      {
        title: "Ask about coming back",
        body: [
          "Sometimes the most valuable part of the first visit is getting permission to return. You might find an oak in July, but the acorns will not be ready until September or October.",
          "Ask what works best. They may want you to knock again. They may ask you to text first. They may tell you to come back anytime during the season.",
          "Whatever arrangement you make, respect it. Permission today does not automatically mean unlimited permission forever."
        ],
        examples: [
          {
            label: "Return visit",
            value: "Would you mind if I checked back later this fall when the acorns are ready?"
          }
        ]
      },
      {
        title: "Keep track of good locations",
        body: [
          "Once you have permission and find a worthwhile plant, make a record. Save the species if you know it, the location, what you observed, whether the seed or fruit was mature, and when you visited.",
          "Also keep clear notes that the location is private property so you do not accidentally treat it like open access later.",
          "Over several years, respectful observations can become a network of known seed sources and productive plants."
        ]
      },
      {
        title: "Relationships can grow too",
        body: [
          "One respectful interaction can lead to another. A landowner who lets you collect a handful of acorns may become interested in what you are growing.",
          "If some of those seeds become seedlings, you may have a good reason to follow up later and show them what came from their tree.",
          "That is how local knowledge grows. It is also how community grows."
        ]
      },
      {
        title: "The point is respect",
        body: [
          "Respect the property, respect the plants, respect the landowner, and respect the answer.",
          "The goal is not simply to get free fruit, berries, nuts, or seeds. The goal is to collect responsibly while creating positive relationships with the people who own or manage the land.",
          "Sometimes the difference between driving past a great seed source and finding one you can return to for years is simply having the courage to knock on the door."
        ]
      }
    ]
  },
  {
    slug: "finding-the-landowner-before-seed-collection",
    title: "Finding the Landowner Before Seed Collection",
    description:
      "Resources and a simple workflow for identifying who owns a promising seed, fruit, nut, or berry collection site before asking permission.",
    excerpt:
      "You found the tree. Now you need to figure out who owns it. These resources can help you find the right person to ask before you collect.",
    publishedAt: "2026-08-11",
    updatedAt: "2026-08-11",
    readingMinutes: 8,
    heroImage: "/images/articles/landowner-seed-collection-research.png",
    heroAlt: "Parcel map, field notebook, and native nuts for landowner research",
    tags: ["Seed collection", "Permission", "Property research", "Pennsylvania"],
    sections: [
      {
        title: "Maps are not permission",
        body: [
          "You found the tree. Now you need to figure out who owns it.",
          "Public records and mapping tools can help you identify a parcel, a property owner, or the agency responsible for a piece of land. They do not give you permission to enter the property or collect anything.",
          "Use these resources to find the right person or office to ask. Then ask before you collect."
        ]
      },
      {
        title: "Start with the county",
        body: [
          "For private property in Pennsylvania, the county government is often the best first stop. County parcel maps and assessment records may show an owner name, parcel number, acreage, mailing address, and approximate parcel boundaries.",
          "Search the county website for parcel viewer, property search, assessment, tax records, or recorder of deeds. If you are not sure where to start, the Pennsylvania county website directory is useful."
        ],
        links: [
          {
            label: "Pennsylvania County Websites",
            href: "https://www.pacounties.org/about/pa-county-websites",
            description: "A statewide directory of Pennsylvania county government websites."
          },
          {
            label: "Monroe County, Pennsylvania",
            href: "https://www.monroecountypa.gov/",
            description: "Useful for Pocono-area property and county office research."
          },
          {
            label: "Carbon County, Pennsylvania",
            href: "https://www.carboncountypa.gov/",
            description: "County starting point for Carbon County parcel and assessment resources."
          },
          {
            label: "Northampton County, Pennsylvania",
            href: "https://www.norcopa.gov/",
            description: "County starting point for Northampton County property records."
          },
          {
            label: "Pike County, Pennsylvania",
            href: "https://www.pikepa.org/",
            description: "County starting point for Pike County public offices and property resources."
          }
        ]
      },
      {
        title: "Helpful parcel and map tools",
        body: [
          "A parcel app can be helpful when you know where a tree is but do not know the address or the property boundary.",
          "Treat these tools as a starting point. Parcel data can be incomplete, outdated, or approximate, so confirm important details through the county when needed."
        ],
        links: [
          {
            label: "Regrid Property Maps",
            href: "https://regrid.com/",
            description: "Useful for visually checking which parcel contains a plant or tree."
          },
          {
            label: "LandGlide",
            href: "https://landglide.com/",
            description: "Useful in the field when rural boundaries are not obvious."
          },
          {
            label: "onX Hunt",
            href: "https://www.onxmaps.com/hunt",
            description: "Outdoor map app with land ownership and parcel information."
          },
          {
            label: "HuntStand",
            href: "https://www.huntstand.com/",
            description: "Outdoor mapping platform that can help check property information from a phone."
          },
          {
            label: "Google Maps",
            href: "https://maps.google.com/",
            description: "Good for getting oriented with roads, driveways, buildings, and satellite imagery."
          },
          {
            label: "Google Earth",
            href: "https://earth.google.com/",
            description: "Helpful for understanding farms, woodlots, and the larger landscape around a possible collection site."
          }
        ]
      },
      {
        title: "If it is public land, check the agency",
        body: [
          "Sometimes a promising tree is not on private property at all. It may be on state forest land, state park land, State Game Lands, municipal land, land trust property, or another managed property.",
          "Public land does not automatically mean collecting is allowed. Identify the agency or organization responsible for the property and check current rules before removing seeds, fruit, nuts, berries, or other natural materials."
        ],
        links: [
          {
            label: "Pennsylvania DCNR Interactive Maps",
            href: "https://www.pa.gov/agencies/dcnr/interactive-maps",
            description: "A starting point for checking Pennsylvania state parks, state forests, and other DCNR-managed lands."
          },
          {
            label: "Pennsylvania State Forests",
            href: "https://www.pa.gov/agencies/dcnr/recreation/where-to-go/state-forests",
            description: "Find state forest information and the managing district."
          },
          {
            label: "Pennsylvania State Parks",
            href: "https://www.pa.gov/agencies/dcnr/recreation/where-to-go/state-parks",
            description: "Find state park information and contact details."
          },
          {
            label: "Pennsylvania State Game Lands",
            href: "https://www.pa.gov/agencies/pgc/huntingandtrapping/where-to-hunt/state-game-lands",
            description: "Pennsylvania Game Commission resource for State Game Lands information."
          }
        ]
      },
      {
        title: "Other useful local resources",
        body: [
          "If basic parcel information is not enough, county assessment offices and recorder of deeds offices can help clarify ownership. Land trusts, conservation districts, and extension offices can also help you understand who manages land or who works with landowners in a county.",
          "These are research and contact resources, not shortcuts around permission."
        ],
        links: [
          {
            label: "WeConservePA",
            href: "https://weconservepa.org/",
            description: "A starting point for Pennsylvania land trusts and conservation organizations."
          },
          {
            label: "Penn State Extension",
            href: "https://extension.psu.edu/",
            description: "Pennsylvania agriculture, forestry, horticulture, native plant, and conservation resources."
          },
          {
            label: "Pennsylvania Association of Conservation Districts",
            href: "https://pacd.org/",
            description: "County conservation districts work with landowners on natural-resource issues."
          }
        ]
      },
      {
        title: "Neighbors may know",
        body: [
          "Do not overlook the simple option. If a large oak sits beside an empty lot, a neighbor may know who owns it.",
          "Be clear about why you are asking. You are not trying to sneak onto the property. You are trying to find the owner because you want permission."
        ],
        examples: [
          {
            label: "Neighbor ask",
            value: "I am sorry to bother you. I am trying to figure out who owns the property next door. There is a tree there I am interested in collecting some seed from, and I would like to ask the owner's permission. Do you happen to know who I should contact?"
          }
        ]
      },
      {
        title: "A simple workflow",
        body: [
          "Do not make landowner research more complicated than it needs to be. Move from observation to ownership research to permission."
        ],
        bullets: [
          "Record the plant and location in BCN Plant Scout.",
          "Use satellite imagery to understand the site.",
          "Check county parcel or assessment resources.",
          "Confirm the owner if the first result is unclear.",
          "Check whether the land is public or managed by an agency or conservation organization.",
          "Ask permission before entering or collecting.",
          "If permission is granted, follow the landowner's conditions and collect responsibly."
        ]
      },
      {
        title: "The map only gets you to the ask",
        body: [
          "A parcel map can help tell you who owns the land. It cannot give you permission to collect from it.",
          "Find the owner. Tell them what you are doing. Ask politely. If they say no, thank them for their time. If they say yes, respect their property, follow their conditions, and leave the place better than you found it."
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
