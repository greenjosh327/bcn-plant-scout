import type { BundleAvailability, BundleComponent, Product, ProductVariation } from "./types";

export const SEED_PACK_SIZE = 25;

type InventoryProduct = Pick<
  Product,
  "id" | "name" | "category" | "inventory" | "productType" | "bundleComponents" | "bundleAvailability"
>;

export type CartInventoryItem = {
  product: InventoryProduct;
  variant?: ProductVariation;
  quantity: number;
};

export type CartInventoryValidation = {
  valid: boolean;
  errors: string[];
  requirements: Array<{
    key: string;
    productId: string;
    name: string;
    required: number;
    available: number;
    unitLabel: string;
  }>;
};

function positiveInteger(value: unknown, fallback = 1) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.max(1, Math.floor(next)) : fallback;
}

export function inferPacksConsumedFromName(name: string) {
  const match = name.match(/(\d+)/);
  if (!match) return 1;
  return Math.max(1, Math.ceil(Number(match[1]) / SEED_PACK_SIZE));
}

export function getVariantPacksConsumed(variant?: Pick<ProductVariation, "name" | "packsConsumed"> | null) {
  if (!variant) return 1;
  return positiveInteger(variant.packsConsumed, inferPacksConsumedFromName(variant.name));
}

export function getVariantAvailableInventory(product: Pick<Product, "category" | "inventory">, variant: ProductVariation) {
  if (product.category === "Seeds") {
    return Math.floor(Math.max(0, Number(product.inventory) || 0) / getVariantPacksConsumed(variant));
  }

  return Math.max(0, Number(variant.inventory) || 0);
}

export function getComponentAvailableInventory(component: BundleComponent) {
  const product = component.componentProduct;
  if (!product) return 0;

  if (component.componentVariant && product.category !== "Seeds") {
    return Math.max(0, Number(component.componentVariant.inventory) || 0);
  }

  return Math.max(0, Number(product.inventory) || 0);
}

export function calculateBundleAvailability(components: BundleComponent[] | undefined): BundleAvailability {
  if (!components?.length) {
    return { available: 0, limitingComponents: [] };
  }

  const componentLimits = components.map((component) => {
    const available = Math.floor(getComponentAvailableInventory(component) / positiveInteger(component.packsConsumed));
    return {
      productId: component.componentProductId,
      name: component.componentProduct?.name ?? "Missing component",
      available,
      packsConsumed: positiveInteger(component.packsConsumed)
    };
  });

  const available = Math.max(0, Math.min(...componentLimits.map((component) => component.available)));
  const limitingComponents = componentLimits.filter((component) => component.available === available);

  return { available, limitingComponents };
}

export function getProductAvailableInventory(product: InventoryProduct, variant?: ProductVariation) {
  if (product.productType === "bundle") {
    return product.bundleAvailability?.available ?? calculateBundleAvailability(product.bundleComponents).available;
  }

  if (variant) {
    return getVariantAvailableInventory(product, variant);
  }

  return Math.max(0, Number(product.inventory) || 0);
}

function addRequirement(
  requirements: Map<string, CartInventoryValidation["requirements"][number]>,
  requirement: CartInventoryValidation["requirements"][number]
) {
  const current = requirements.get(requirement.key);
  if (!current) {
    requirements.set(requirement.key, requirement);
    return;
  }

  requirements.set(requirement.key, {
    ...current,
    required: current.required + requirement.required,
    available: Math.min(current.available, requirement.available)
  });
}

export function validateCartInventory(items: CartInventoryItem[]): CartInventoryValidation {
  const requirements = new Map<string, CartInventoryValidation["requirements"][number]>();

  for (const item of items) {
    const quantity = positiveInteger(item.quantity);

    if (item.product.productType === "bundle") {
      for (const component of item.product.bundleComponents ?? []) {
        const packsConsumed = positiveInteger(component.packsConsumed);
        addRequirement(requirements, {
          key: `product:${component.componentProductId}`,
          productId: component.componentProductId,
          name: component.componentProduct?.name ?? "Bundle component",
          required: quantity * packsConsumed,
          available: getComponentAvailableInventory(component),
          unitLabel: "25-seed pack"
        });
      }
      continue;
    }

    if (item.variant && item.product.category !== "Seeds") {
      addRequirement(requirements, {
        key: `variant:${item.variant.id ?? item.variant.sku ?? item.variant.name}`,
        productId: item.product.id,
        name: `${item.product.name} (${item.variant.name})`,
        required: quantity,
        available: Math.max(0, Number(item.variant.inventory) || 0),
        unitLabel: "item"
      });
      continue;
    }

    const packsConsumed = item.product.category === "Seeds" ? getVariantPacksConsumed(item.variant) : 1;
    addRequirement(requirements, {
      key: `product:${item.product.id}`,
      productId: item.product.id,
      name: item.product.name,
      required: quantity * packsConsumed,
      available: Math.max(0, Number(item.product.inventory) || 0),
      unitLabel: item.product.category === "Seeds" ? "25-seed pack" : "item"
    });
  }

  const requirementList = Array.from(requirements.values());
  const errors = requirementList
    .filter((requirement) => requirement.required > requirement.available)
    .map((requirement) => {
      const unit = requirement.unitLabel;
      const plural = requirement.available === 1 ? unit : `${unit}s`;
      return `Only ${requirement.available} ${plural} of ${requirement.name} ${requirement.available === 1 ? "is" : "are"} available for this cart.`;
    });

  return {
    valid: errors.length === 0,
    errors,
    requirements: requirementList
  };
}
