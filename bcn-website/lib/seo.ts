import type { Metadata } from "next";
import { getPrimaryProductImage } from "./product-images";
import type { Product } from "./types";

export const siteConfig = {
  name: "Base Camp North",
  url: "https://basecampnorthpa.com",
  defaultTitle: "Base Camp North | Native Trees, Seeds and GIS Services",
  titleTemplate: "%s | Base Camp North",
  defaultDescription:
    "Base Camp North offers native tree seeds, nursery plants, growing information, and GIS mapping services from Pennsylvania.",
  locale: "en_US",
  twitterCard: "summary_large_image",
  defaultSocialImage: {
    url: "/images/bcn-logo.png",
    width: 1536,
    height: 561,
    alt: "Base Camp North logo"
  }
} as const;

type PageMetadataInput = {
  title: string;
  description: string;
  path: string;
  robots?: Metadata["robots"];
};

type SocialImageInput = {
  url: string;
  alt: string;
  width?: number;
  height?: number;
};

const DESCRIPTION_LENGTH = 160;
const TITLE_LENGTH = 70;
const PLACEHOLDER_VALUES = new Set([
  "See description",
  "See product description",
  "See product description for bloom and pollinator notes.",
  "Selected for nursery, wildlife, food forest, or restoration value.",
  "Shipping and pickup availability depends on item size, season, and live-plant condition."
]);

const VERIFIED_LOCAL_SOCIAL_IMAGES = new Set([
  "/bcn-icon.png",
  "/images/bcn-logo.png",
  "/images/scout-berry-branch.webp",
  "/images/scout-cuttings-bundle.webp",
  "/images/scout-elderberry.webp",
  "/images/scout-field-kit.webp",
  "/images/scout-field-map.webp",
  "/images/scout-greenhouse-tools.webp",
  "/images/scout-nut-pile.webp",
  "/images/scout-seedling-tray.webp"
]);

export function buildCanonicalUrl(path = "/") {
  const pathOnly = path
    .trim()
    .replace(/^https?:\/\/[^/]+/i, "")
    .split(/[?#]/)[0];
  const normalizedPath = `/${pathOnly.replace(/^\/+/, "")}`.replace(/\/{2,}/g, "/");

  return new URL(normalizedPath, siteConfig.url).toString();
}

export function buildRootMetadata(): Metadata {
  const image = getDefaultSocialImage();

  return {
    metadataBase: new URL(siteConfig.url),
    title: {
      default: siteConfig.defaultTitle,
      template: siteConfig.titleTemplate
    },
    description: siteConfig.defaultDescription,
    applicationName: siteConfig.name,
    icons: {
      icon: [{ url: "/bcn-icon.png", sizes: "1024x1024", type: "image/png" }],
      apple: [{ url: "/bcn-icon.png", sizes: "1024x1024", type: "image/png" }]
    },
    openGraph: {
      title: siteConfig.defaultTitle,
      description: siteConfig.defaultDescription,
      url: siteConfig.url,
      siteName: siteConfig.name,
      locale: siteConfig.locale,
      type: "website",
      images: image ? [toOpenGraphImage(image)] : undefined
    },
    twitter: {
      card: image ? siteConfig.twitterCard : "summary",
      title: siteConfig.defaultTitle,
      description: siteConfig.defaultDescription,
      images: image ? [toTwitterImage(image)] : undefined
    }
  };
}

export function buildPageMetadata({ title, description, path, robots }: PageMetadataInput): Metadata {
  const cleanTitle = cleanMetaTitle(title);
  const metadataTitle = cleanTitle.includes(siteConfig.name) ? { absolute: cleanTitle } : cleanTitle;
  const cleanDescription = cleanMetaDescription(description) || siteConfig.defaultDescription;
  const canonical = buildCanonicalUrl(path);
  const image = getDefaultSocialImage();

  return {
    title: metadataTitle,
    description: cleanDescription,
    alternates: {
      canonical
    },
    robots,
    openGraph: {
      title: cleanTitle,
      description: cleanDescription,
      url: canonical,
      siteName: siteConfig.name,
      locale: siteConfig.locale,
      type: "website",
      images: image ? [toOpenGraphImage(image)] : undefined
    },
    twitter: {
      card: image ? siteConfig.twitterCard : "summary",
      title: cleanTitle,
      description: cleanDescription,
      images: image ? [toTwitterImage(image)] : undefined
    }
  };
}

export function buildProductMetadata(product: Product): Metadata {
  const title = cleanMetaTitle(product.name);
  const description = buildProductMetaDescription(product);
  const canonical = buildCanonicalUrl(`/shop/product/${product.slug}`);
  const image = getProductSocialImage(product);

  return {
    title,
    description,
    alternates: {
      canonical
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: siteConfig.name,
      locale: siteConfig.locale,
      type: "website",
      images: image ? [toOpenGraphImage(image)] : undefined
    },
    twitter: {
      card: image ? siteConfig.twitterCard : "summary",
      title,
      description,
      images: image ? [toTwitterImage(image)] : undefined
    }
  };
}

export function buildNoindexMetadata(): Metadata {
  return {
    robots: {
      index: false,
      follow: false
    }
  };
}

export function buildProductMetaDescription(product: Product) {
  const publicDescription = cleanMetaDescription(product.description);
  if (publicDescription && publicDescription.length >= 35) return publicDescription;

  const generated = buildGeneratedProductDescription(product);
  return cleanMetaDescription(generated) || siteConfig.defaultDescription;
}

export function cleanMetaDescription(value: string | null | undefined, maxLength = DESCRIPTION_LENGTH) {
  const text = cleanMetadataText(value);
  if (!text || PLACEHOLDER_VALUES.has(text)) return "";
  return truncateAtWord(text, maxLength, true);
}

export function cleanMetaTitle(value: string | null | undefined, maxLength = TITLE_LENGTH) {
  const text = cleanMetadataText(value);
  return truncateAtWord(text || siteConfig.name, maxLength, false).replace(/[.:;,]+$/g, "");
}

export function buildAbsoluteImageUrl(value: string | null | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) return "";

  try {
    const url = new URL(raw, siteConfig.url);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (raw.startsWith("/") && !VERIFIED_LOCAL_SOCIAL_IMAGES.has(url.pathname)) return "";
    if (isExpiringImageUrl(url)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function getProductSocialImage(product: Product) {
  const primaryImage = getPrimaryProductImage(product);
  const productImage = primaryImage.isFallback
    ? null
    : buildSocialImage({
        url: primaryImage.url,
        alt: primaryImage.altText || product.name
      });

  return productImage ?? getDefaultSocialImage();
}

function getDefaultSocialImage() {
  return buildSocialImage(siteConfig.defaultSocialImage);
}

function buildSocialImage(image: SocialImageInput) {
  const url = buildAbsoluteImageUrl(image.url);
  if (!url) return null;

  return {
    ...image,
    url
  };
}

function toOpenGraphImage(image: SocialImageInput) {
  return {
    url: image.url,
    width: image.width,
    height: image.height,
    alt: image.alt
  };
}

function toTwitterImage(image: SocialImageInput) {
  return {
    url: image.url,
    alt: image.alt
  };
}

function buildGeneratedProductDescription(product: Product) {
  const name = cleanMetaTitle(product.name, 90);
  const category = productCategoryPhrase(product.category);
  const details = [
    cleanMetadataText(product.scientificName),
    cleanMetadataText(product.commonName),
    visibleProductFact(product.nativeStatus, product.showNativeStatus),
    visibleProductFact(product.sunlight, product.showSunlight),
    visibleProductFact(product.soil, product.showSoil)
  ]
    .filter((value) => value && !PLACEHOLDER_VALUES.has(value))
    .slice(0, 3);

  const detailText = details.length ? ` with notes for ${details.join(", ")}` : "";
  return `${name} is a Base Camp North ${category}${detailText}.`;
}

function visibleProductFact(value: string | undefined, visible: boolean | undefined) {
  if (visible === false) return "";
  return cleanMetadataText(value);
}

function productCategoryPhrase(category: Product["category"]) {
  if (category === "Seeds") return "seed listing";
  if (category === "Plants") return "nursery plant listing";
  if (category === "Cuttings") return "cutting listing";
  return "product listing";
}

function cleanMetadataText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([),.;:!?])/g, "$1")
    .replace(/([(])\s+/g, "$1")
    .trim();
}

function truncateAtWord(value: string, maxLength: number, sentenceLike: boolean) {
  if (value.length <= maxLength) return value;

  const clipped = value.slice(0, maxLength + 1);
  const sentenceMatch = sentenceLike ? clipped.match(/^(.{80,}[.!?])\s/) : null;
  if (sentenceMatch?.[1]) return sentenceMatch[1];

  const lastSpace = clipped.lastIndexOf(" ");
  const truncated = (lastSpace > 30 ? clipped.slice(0, lastSpace) : clipped.slice(0, maxLength))
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?-]+$/g, "")
    .trim();

  if (!sentenceLike) return truncated;
  return /[.!?]$/.test(truncated) ? truncated : `${truncated}.`;
}

function isExpiringImageUrl(url: URL) {
  const pathname = url.pathname.toLowerCase();
  if (pathname.includes("/storage/v1/object/sign/")) return true;

  const signedParams = ["token", "expires", "signature", "x-amz-signature", "x-goog-signature"];
  return signedParams.some((param) => url.searchParams.has(param));
}
