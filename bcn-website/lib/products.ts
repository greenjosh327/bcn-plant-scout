import type { Product } from "./types";

export const products: Product[] = [
  {
    id: "prod_pawpaw_seedling",
    slug: "pawpaw-seedling",
    name: "Pawpaw Seedling",
    scientificName: "Asimina triloba",
    commonName: "Pawpaw",
    category: "Plants",
    description:
      "A young native fruit tree for woodland edges, wildlife gardens, and backyard food forests.",
    price: 18,
    inventory: 12,
    featured: true,
    active: true,
    images: ["/images/scout-seedling-tray.webp"],
    plantType: "Native fruit tree",
    nativeStatus: "Native to Pennsylvania",
    hardinessZones: "5-9",
    sunlight: "Part shade to full sun once established",
    soil: "Moist, rich, well-drained soil",
    height: "15-25 ft",
    spread: "10-15 ft",
    bloomTime: "Spring",
    wildlifeBenefits: "Fruit for mammals; cover for birds",
    pollinatorBenefits: "Unusual flowers support specialized pollinators",
    hostSpecies: "Zebra swallowtail butterfly",
    shippingNotes: "Local pickup preferred while young trees harden off.",
    growingNotes:
      "Protect young trees from afternoon sun and deer browse for the first few seasons.",
    localPickup: true,
    ships: false,
    tags: ["fruit", "native", "understory", "wildlife"],
    createdAt: "2026-07-01",
    updatedAt: "2026-07-01"
  },
  {
    id: "prod_elderberry_cuttings",
    slug: "elderberry-cuttings",
    name: "Elderberry Cuttings",
    scientificName: "Sambucus canadensis",
    commonName: "American elderberry",
    category: "Cuttings",
    description:
      "Dormant hardwood cuttings from productive elderberry stock for quick nursery propagation.",
    price: 10,
    inventory: 35,
    featured: true,
    active: true,
    images: ["/images/scout-elderberry.webp", "/images/scout-cuttings-bundle.webp"],
    plantType: "Native shrub cutting",
    nativeStatus: "Native to eastern North America",
    hardinessZones: "4-9",
    sunlight: "Full sun to part shade",
    soil: "Moist soil; tolerates wet edges",
    height: "6-12 ft",
    spread: "6-10 ft",
    bloomTime: "Early summer",
    wildlifeBenefits: "Berries for birds and mammals",
    pollinatorBenefits: "Clusters of small flowers support beneficial insects",
    hostSpecies: "Supports several native moth species",
    shippingNotes: "Ships dormant when conditions allow.",
    growingNotes:
      "Stick cuttings into moist media with two nodes below soil and one node above.",
    localPickup: true,
    ships: true,
    tags: ["berries", "cuttings", "pollinators", "wet soil"],
    createdAt: "2026-07-01",
    updatedAt: "2026-07-01"
  },
  {
    id: "prod_red_oak_acorns",
    slug: "red-oak-acorns",
    name: "Red Oak Acorns",
    scientificName: "Quercus rubra",
    commonName: "Northern red oak",
    category: "Seeds",
    description:
      "Locally collected acorns for restoration projects, backyard nurseries, and wildlife plantings.",
    price: 8,
    inventory: 0,
    featured: true,
    active: true,
    images: ["/images/scout-nut-pile.webp"],
    plantType: "Native tree seed",
    nativeStatus: "Native to Pennsylvania",
    hardinessZones: "3-8",
    sunlight: "Full sun",
    soil: "Well-drained acidic to neutral soils",
    height: "60-75 ft",
    spread: "45-60 ft",
    bloomTime: "Spring catkins",
    wildlifeBenefits: "High-value mast tree for wildlife",
    pollinatorBenefits: "Supports hundreds of caterpillar species",
    hostSpecies: "Keystone oak host for moths and butterflies",
    shippingNotes: "Seasonal item. Availability depends on mast year and collection timing.",
    growingNotes:
      "Cold stratify and protect from rodents. Plant deep enough to avoid drying.",
    localPickup: true,
    ships: true,
    tags: ["oak", "seed", "wildlife", "restoration"],
    createdAt: "2026-07-01",
    updatedAt: "2026-07-01"
  },
  {
    id: "prod_serviceberry",
    slug: "serviceberry-seedling",
    name: "Serviceberry Seedling",
    scientificName: "Amelanchier canadensis",
    commonName: "Juneberry, shadbush",
    category: "Plants",
    description:
      "A small native tree with spring bloom, edible berries, and excellent wildlife value.",
    price: 16,
    inventory: 8,
    featured: false,
    active: true,
    images: ["/images/scout-berry-branch.webp"],
    plantType: "Native small tree",
    nativeStatus: "Native to Pennsylvania",
    hardinessZones: "4-8",
    sunlight: "Full sun to part shade",
    soil: "Average to moist, well-drained soil",
    height: "15-25 ft",
    spread: "10-15 ft",
    bloomTime: "Early spring",
    wildlifeBenefits: "Berries for birds; early-season cover",
    pollinatorBenefits: "Early flowers for bees",
    hostSpecies: "Supports native butterflies and moths",
    shippingNotes: "Local pickup recommended.",
    growingNotes: "Great for woodland edges and small yards.",
    localPickup: true,
    ships: false,
    tags: ["berries", "small tree", "native", "spring bloom"],
    createdAt: "2026-07-01",
    updatedAt: "2026-07-01"
  }
];

export function getFeaturedProducts() {
  return products.filter((product) => product.featured && product.active);
}

export function getProductBySlug(slug: string) {
  return products.find((product) => product.slug === slug && product.active);
}

export function getRelatedProducts(product: Product) {
  return products
    .filter((candidate) => candidate.active && candidate.slug !== product.slug)
    .filter((candidate) => candidate.category === product.category || candidate.tags.some((tag) => product.tags.includes(tag)))
    .slice(0, 3);
}
