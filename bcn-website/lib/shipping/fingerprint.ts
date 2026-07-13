import { createHash } from "node:crypto";
import type { PackagePlanResult, ShippingAddress, ShippingCartItem } from "./types";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stableValue(item));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, next]) => [key, stableValue(next)])
  );
}

function stableJson(value: unknown) {
  return JSON.stringify(stableValue(value));
}

export function createShippingQuoteFingerprint(input: {
  shippingItems: ShippingCartItem[];
  packagePlan: PackagePlanResult;
  destinationAddress: ShippingAddress | Record<string, unknown>;
}) {
  const payload = {
    address: input.destinationAddress,
    items: input.shippingItems
      .map((item) => ({
        productId: item.productId,
        variantKey: item.variantKey ?? "",
        quantity: item.quantity,
        shippingClass: item.shippingClass,
        shippingEnabled: item.shippingEnabled,
        localPickupEnabled: item.localPickupEnabled,
        packedWeightOz: item.packedWeightOz,
        packedLengthIn: item.packedLengthIn,
        packedWidthIn: item.packedWidthIn,
        packedHeightIn: item.packedHeightIn,
        shipsAlone: item.shipsAlone,
        expeditedRequired: item.expeditedRequired,
        allowGroundAdvantage: item.allowGroundAdvantage,
        freeShippingEligible: item.freeShippingEligible,
        shippingSurchargeCents: item.shippingSurchargeCents,
        maxQuantityPerPackage: item.maxQuantityPerPackage,
        preferredPackageId: item.preferredPackageId
      }))
      .sort((left, right) => `${left.productId}:${left.variantKey}`.localeCompare(`${right.productId}:${right.variantKey}`)),
    packages: input.packagePlan.packages
      .map((pkg) => ({
        items: pkg.items
          .map((item) => ({
            productId: item.productId,
            variantKey: item.variantKey ?? "",
            name: item.name,
            quantity: item.quantity,
            shippingClass: item.shippingClass
          }))
          .sort((left, right) => `${left.productId}:${left.variantKey}`.localeCompare(`${right.productId}:${right.variantKey}`)),
        shippingClasses: [...pkg.shippingClasses].sort(),
        packagePresetId: pkg.packagePresetId,
        packagePresetCode: pkg.packagePresetCode,
        weightOz: pkg.weightOz,
        lengthIn: pkg.lengthIn,
        widthIn: pkg.widthIn,
        heightIn: pkg.heightIn,
        shipsAlone: pkg.shipsAlone,
        containsTree: pkg.containsTree
      }))
      .sort((left, right) => stableJson(left).localeCompare(stableJson(right))),
    packageErrors: input.packagePlan.errors
  };

  return createHash("sha256").update(stableJson(payload)).digest("hex");
}
