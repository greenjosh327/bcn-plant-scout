export type ProductCategory = "Plants" | "Cuttings" | "Seeds";

export type ProductVariation = {
  id?: string;
  name: string;
  sku: string;
  price: number;
  inventory: number;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  scientificName: string;
  commonName: string;
  category: ProductCategory;
  description: string;
  price: number;
  inventory: number;
  featured: boolean;
  active: boolean;
  images: string[];
  plantType: string;
  nativeStatus: string;
  hardinessZones: string;
  sunlight: string;
  soil: string;
  height: string;
  spread: string;
  bloomTime: string;
  wildlifeBenefits: string;
  pollinatorBenefits: string;
  hostSpecies: string;
  shippingNotes: string;
  growingNotes: string;
  localPickup: boolean;
  ships: boolean;
  tags: string[];
  variations?: ProductVariation[];
  source?: "manual" | "square" | "etsy";
  createdAt: string;
  updatedAt: string;
};
