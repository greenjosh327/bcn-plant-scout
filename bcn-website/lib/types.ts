import type { ShippingClass } from "./shipping/types";

export type ProductCategory = "Plants" | "Cuttings" | "Seeds";
export type ProductType = "standard" | "bundle";

export type ProductVariation = {
  id?: string;
  name: string;
  sku: string;
  price: number;
  inventory: number;
  packsConsumed?: number;
};

export type ProductImage = {
  url: string;
  altText: string;
  isPrimary?: boolean;
  sortOrder?: number | null;
  isFallback?: boolean;
};

export type BundleComponentProduct = {
  id: string;
  slug: string;
  name: string;
  scientificName: string;
  commonName: string;
  category: ProductCategory;
  inventory: number;
  images: string[];
  imageDetails?: ProductImage[];
  variations?: ProductVariation[];
};

export type BundleComponent = {
  id: string;
  bundleProductId: string;
  componentProductId: string;
  componentVariantId?: string | null;
  packsConsumed: number;
  sortOrder: number;
  componentProduct?: BundleComponentProduct;
  componentVariant?: ProductVariation;
};

export type BundleAvailability = {
  available: number;
  limitingComponents: Array<{
    productId: string;
    name: string;
    available: number;
    packsConsumed: number;
  }>;
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
  productType?: ProductType;
  bundleComponents?: BundleComponent[];
  bundleAvailability?: BundleAvailability;
  featured: boolean;
  active: boolean;
  images: string[];
  imageDetails?: ProductImage[];
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
  plantingInstructions?: string;
  showHardinessZones?: boolean;
  showSunlight?: boolean;
  showSoil?: boolean;
  showBloomTime?: boolean;
  showHeight?: boolean;
  showSpread?: boolean;
  showNativeStatus?: boolean;
  showWildlifeBenefits?: boolean;
  showPollinatorBenefits?: boolean;
  showHostSpecies?: boolean;
  shippingClass?: ShippingClass | "";
  shippingEnabled?: boolean;
  localPickupEnabled?: boolean;
  packedWeightOz?: number | null;
  packedLengthIn?: number | null;
  packedWidthIn?: number | null;
  packedHeightIn?: number | null;
  shipsAlone?: boolean;
  expeditedRequired?: boolean;
  allowGroundAdvantage?: boolean;
  freeShippingEligible?: boolean;
  shippingSurchargeCents?: number;
  maxQuantityPerPackage?: number;
  preferredPackageId?: string;
  shippingConfigurationComplete?: boolean;
  localPickup: boolean;
  ships: boolean;
  tags: string[];
  variations?: ProductVariation[];
  source?: "manual" | "square" | "etsy";
  createdAt: string;
  updatedAt: string;
};
