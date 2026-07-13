import type {
  BuiltShippingPackage,
  PackagePlanResult,
  ShippingCartItem,
  ShippingClass,
  ShippingPackageItem,
  ShippingPackagePreset,
  ShippingSettings
} from "./types";

type PackageTemplate = {
  presetId: string | null;
  presetCode: string | null;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  emptyWeightOz: number;
  maximumWeightOz: number | null;
};

const CUSTOM_MAX_WEIGHT_OZ = 1120;

function isPositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function itemKey(item: ShippingCartItem) {
  return `${item.productId}:${item.variantKey ?? ""}`;
}

function getPreset(item: ShippingCartItem, presets: ShippingPackagePreset[]) {
  if (!item.preferredPackageId) return null;
  return presets.find((preset) => preset.id === item.preferredPackageId) ?? null;
}

function findSeedEnvelopePreset(presets: ShippingPackagePreset[]) {
  return presets.find((preset) => preset.code === "seed_envelope_4x6" && preset.active) ?? presets.find((preset) => preset.allowed_shipping_classes.includes("seed_envelope"));
}

function resolveTemplate(item: ShippingCartItem, presets: ShippingPackagePreset[], errors: string[]): PackageTemplate | null {
  const preset = getPreset(item, presets);
  if (preset) {
    const shippingClass = item.shippingClass;
    if (shippingClass && !preset.allowed_shipping_classes.includes(shippingClass)) {
      errors.push(`${item.name} uses a package preset that does not allow ${shippingClass}.`);
    }
    return {
      presetId: preset.id,
      presetCode: preset.code,
      lengthIn: Number(preset.length_in),
      widthIn: Number(preset.width_in),
      heightIn: Number(preset.height_in),
      emptyWeightOz: Number(preset.empty_weight_oz) || 0,
      maximumWeightOz: Number(preset.maximum_weight_oz) || null
    };
  }

  const customLength = item.packedLengthIn;
  const customWidth = item.packedWidthIn;
  const customHeight = item.packedHeightIn;

  if (isPositive(customLength) && isPositive(customWidth) && isPositive(customHeight)) {
    return {
      presetId: null,
      presetCode: null,
      lengthIn: customLength,
      widthIn: customWidth,
      heightIn: customHeight,
      emptyWeightOz: 0,
      maximumWeightOz: CUSTOM_MAX_WEIGHT_OZ
    };
  }

  errors.push(`${item.name} needs a package preset or full packed dimensions before it can ship.`);
  return null;
}

function buildPackage(
  packageIndex: number,
  items: ShippingPackageItem[],
  template: PackageTemplate,
  itemWeightOz: number,
  shipsAlone: boolean
): BuiltShippingPackage {
  const isSeedEnvelope = template.presetCode === "seed_envelope_4x6";
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const itemWeightTotal = itemWeightOz * totalQuantity;
  const packageWeight = isSeedEnvelope
    ? Math.max(itemWeightTotal, template.emptyWeightOz, 1)
    : itemWeightTotal + template.emptyWeightOz;
  const shippingClasses = Array.from(new Set(items.map((item) => item.shippingClass)));

  return {
    packageIndex,
    packageKey: `pkg_${packageIndex}`,
    items,
    shippingClasses,
    packagePresetId: template.presetId,
    packagePresetCode: template.presetCode,
    weightOz: Number(packageWeight.toFixed(2)),
    lengthIn: template.lengthIn,
    widthIn: template.widthIn,
    heightIn: template.heightIn,
    shipsAlone,
    containsTree: shippingClasses.includes("tree")
  };
}

function assertMaximumWeight(pkg: BuiltShippingPackage, template: PackageTemplate, errors: string[]) {
  if (template.maximumWeightOz && pkg.weightOz > template.maximumWeightOz) {
    errors.push(`Package ${pkg.packageIndex} is ${pkg.weightOz} oz, above the ${template.maximumWeightOz} oz limit for ${template.presetCode ?? "custom package"}.`);
  }
}

function createPackageItem(item: ShippingCartItem, quantity: number): ShippingPackageItem {
  return {
    productId: item.productId,
    variantKey: item.variantKey,
    name: item.name,
    quantity,
    shippingClass: item.shippingClass as ShippingClass
  };
}

export function buildPackagePlan(
  cartItems: ShippingCartItem[],
  presets: ShippingPackagePreset[],
  settings: ShippingSettings
): PackagePlanResult {
  const errors: string[] = [];
  const packages: BuiltShippingPackage[] = [];
  const ignoredDigitalItems = cartItems.filter((item) => item.shippingClass === "digital");
  const pickupOnlyItems = cartItems.filter((item) => item.shippingClass === "oversized_pickup_only" || (!item.shippingEnabled && item.shippingClass !== "digital"));
  const seedEnvelopeItems: ShippingCartItem[] = [];

  let packageIndex = 1;

  for (const item of cartItems) {
    if (item.quantity <= 0) continue;
    if (item.shippingClass === "digital") continue;
    if (item.shippingClass === "oversized_pickup_only" || !item.shippingEnabled) continue;

    if (!item.shippingClass) {
      errors.push(`${item.name} needs a shipping class before it can ship.`);
      continue;
    }

    if (!isPositive(item.packedWeightOz)) {
      errors.push(`${item.name} needs a packed weight greater than zero before it can ship.`);
      continue;
    }

    if (item.shippingClass === "seed_envelope" && !item.shipsAlone) {
      seedEnvelopeItems.push(item);
      continue;
    }

    const template = resolveTemplate(item, presets, errors);
    if (!template) continue;

    const chunkSize = item.shipsAlone ? 1 : Math.max(1, item.maxQuantityPerPackage || 1);
    let remaining = item.quantity;
    while (remaining > 0) {
      const quantity = Math.min(chunkSize, remaining);
      const pkg = buildPackage(packageIndex, [createPackageItem(item, quantity)], template, item.packedWeightOz, item.shipsAlone);
      assertMaximumWeight(pkg, template, errors);
      packages.push(pkg);
      packageIndex += 1;
      remaining -= quantity;
    }
  }

  if (seedEnvelopeItems.length > 0) {
    const preset = findSeedEnvelopePreset(presets);
    if (!preset) {
      errors.push("Seed envelope shipping needs an active Seed Envelope package preset.");
    } else {
      const template: PackageTemplate = {
        presetId: preset.id,
        presetCode: preset.code,
        lengthIn: Number(preset.length_in),
        widthIn: Number(preset.width_in),
        heightIn: Number(preset.height_in),
        emptyWeightOz: Number(preset.empty_weight_oz) || 1,
        maximumWeightOz: Number(preset.maximum_weight_oz) || settings.maxEconomyEnvelopeWeightOz
      };
      let currentItems: ShippingPackageItem[] = [];
      let currentQuantity = 0;
      let currentWeight = 0;

      function flushSeedPackage() {
        if (currentItems.length === 0) return;
        const pkg = buildPackage(packageIndex, currentItems, template, currentWeight / Math.max(currentQuantity, 1), false);
        assertMaximumWeight(pkg, template, errors);
        packages.push(pkg);
        packageIndex += 1;
        currentItems = [];
        currentQuantity = 0;
        currentWeight = 0;
      }

      for (const item of seedEnvelopeItems) {
        const maxQuantity = Math.max(1, item.maxQuantityPerPackage || settings.maxSeedPacketsPerEconomyEnvelope);
        for (let count = 0; count < item.quantity; count += 1) {
          const nextQuantity = currentQuantity + 1;
          const nextWeight = currentWeight + (item.packedWeightOz ?? 0);
          const exceedsEnvelopeQuantity = nextQuantity > settings.maxSeedPacketsPerEconomyEnvelope || nextQuantity > maxQuantity;
          const exceedsEnvelopeWeight = nextWeight > settings.maxEconomyEnvelopeWeightOz;
          if (currentItems.length > 0 && (exceedsEnvelopeQuantity || exceedsEnvelopeWeight)) {
            flushSeedPackage();
          }
          currentItems.push(createPackageItem(item, 1));
          currentQuantity += 1;
          currentWeight += item.packedWeightOz ?? 0;
        }
      }
      flushSeedPackage();
    }
  }

  return {
    packages: packages.map((pkg, index) => ({ ...pkg, packageIndex: index + 1, packageKey: `pkg_${index + 1}` })),
    ignoredDigitalItems,
    pickupOnlyItems,
    errors: Array.from(new Set(errors))
  };
}
