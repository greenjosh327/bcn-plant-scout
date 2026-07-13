import type { Product } from "../types";
import type { ShippingCartItem } from "./types";

function positiveNumberOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function productToShippingCartItem(product: Product, quantity: number, variantKey?: string): ShippingCartItem {
  return {
    productId: product.id,
    variantKey,
    name: product.name,
    quantity: Math.max(1, Number(quantity) || 1),
    shippingClass: product.shippingClass ?? "",
    shippingEnabled: product.shippingEnabled ?? product.ships,
    localPickupEnabled: product.localPickupEnabled ?? product.localPickup,
    packedWeightOz: positiveNumberOrNull(product.packedWeightOz),
    packedLengthIn: positiveNumberOrNull(product.packedLengthIn),
    packedWidthIn: positiveNumberOrNull(product.packedWidthIn),
    packedHeightIn: positiveNumberOrNull(product.packedHeightIn),
    shipsAlone: Boolean(product.shipsAlone),
    expeditedRequired: Boolean(product.expeditedRequired),
    allowGroundAdvantage: product.allowGroundAdvantage !== false,
    freeShippingEligible: Boolean(product.freeShippingEligible),
    shippingSurchargeCents: Math.max(0, Number(product.shippingSurchargeCents) || 0),
    maxQuantityPerPackage: Math.max(1, Number(product.maxQuantityPerPackage) || 1),
    preferredPackageId: product.preferredPackageId ?? ""
  };
}
