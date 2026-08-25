const PRODUCT_SLUG_ALIASES: Record<string, string> = {
  "new-product-584560": "black-chokeberry-aronia-melanocarpa-seeds"
};

export function normalizeProductSlug(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[\u2018\u2019']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function decodeProductSlug(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function resolveProductSlugAlias(value: string | null | undefined) {
  const normalized = normalizeProductSlug(value);
  return PRODUCT_SLUG_ALIASES[normalized] ?? normalized;
}
