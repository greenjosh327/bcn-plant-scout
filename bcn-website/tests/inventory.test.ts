import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateBundleAvailability,
  getProductAvailableInventory,
  validateCartInventory
} from "../lib/inventory";
import type { BundleComponent, Product, ProductVariation } from "../lib/types";

function variant(overrides: Partial<ProductVariation> = {}): ProductVariation {
  return {
    id: "var-25",
    name: "25 Seeds",
    sku: "SEED-25",
    price: 5,
    inventory: 10,
    packsConsumed: 1,
    ...overrides
  };
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-huckleberry",
    slug: "black-huckleberry",
    name: "Black Huckleberry Seeds",
    scientificName: "Gaylussacia baccata",
    commonName: "Black Huckleberry",
    category: "Seeds",
    description: "",
    price: 5,
    inventory: 10,
    featured: false,
    active: true,
    images: ["/image.jpg"],
    plantType: "Seeds",
    nativeStatus: "",
    hardinessZones: "",
    sunlight: "",
    soil: "",
    height: "",
    spread: "",
    bloomTime: "",
    wildlifeBenefits: "",
    pollinatorBenefits: "",
    hostSpecies: "",
    shippingNotes: "",
    growingNotes: "",
    localPickup: false,
    ships: true,
    tags: [],
    variations: [],
    createdAt: "",
    updatedAt: "",
    productType: "standard",
    ...overrides
  };
}

function component(componentProduct: Product, overrides: Partial<BundleComponent> = {}): BundleComponent {
  return {
    id: `component-${componentProduct.id}`,
    bundleProductId: "prod-bundle",
    componentProductId: componentProduct.id,
    componentVariantId: undefined,
    packsConsumed: 1,
    sortOrder: 10,
    componentProduct: {
      id: componentProduct.id,
      slug: componentProduct.slug,
      name: componentProduct.name,
      scientificName: componentProduct.scientificName,
      commonName: componentProduct.commonName,
      category: componentProduct.category,
      inventory: componentProduct.inventory,
      images: componentProduct.images,
      imageDetails: componentProduct.imageDetails,
      variations: componentProduct.variations
    },
    ...overrides
  };
}

describe("seed-pack and bundle inventory", () => {
  it("treats a 25-seed variant as one physical pack", () => {
    const huckleberry = product({ inventory: 10 });
    const pack25 = variant({ name: "25 Seeds", packsConsumed: 1 });
    const validation = validateCartInventory([{ product: huckleberry, variant: pack25, quantity: 1 }]);

    assert.equal(getProductAvailableInventory(huckleberry, pack25), 10);
    assert.equal(validation.requirements[0].required, 1);
    assert.equal(huckleberry.inventory - validation.requirements[0].required, 9);
  });

  it("treats a 100-seed variant as four physical packs", () => {
    const huckleberry = product({ inventory: 10 });
    const pack100 = variant({ name: "100 Seeds", packsConsumed: 4 });
    const validation = validateCartInventory([{ product: huckleberry, variant: pack100, quantity: 1 }]);

    assert.equal(getProductAvailableInventory(huckleberry, pack100), 2);
    assert.equal(validation.requirements[0].required, 4);
    assert.equal(huckleberry.inventory - validation.requirements[0].required, 6);
  });

  it("deducts every component when a bundle is sold once", () => {
    const components = ["Black Cherry", "Staghorn Sumac", "Black Huckleberry", "Black Chokeberry", "Red Elderberry"]
      .map((name, index) => component(product({ id: `prod-${index}`, name, inventory: 10 })));
    const bundle = product({
      id: "prod-bundle",
      name: "Wildlife Habitat Seed Collection",
      productType: "bundle",
      bundleComponents: components,
      bundleAvailability: calculateBundleAvailability(components)
    });

    const validation = validateCartInventory([{ product: bundle, quantity: 1 }]);

    assert.equal(validation.valid, true);
    assert.equal(validation.requirements.length, 5);
    assert.ok(validation.requirements.every((requirement) => requirement.required === 1));
  });

  it("calculates bundle availability from the lowest component inventory", () => {
    const components = [
      component(product({ id: "prod-cherry", name: "Black Cherry", inventory: 20 })),
      component(product({ id: "prod-sumac", name: "Staghorn Sumac", inventory: 15 })),
      component(product({ id: "prod-huckleberry", name: "Black Huckleberry", inventory: 3 }))
    ];

    const availability = calculateBundleAvailability(components);

    assert.equal(availability.available, 3);
    assert.equal(availability.limitingComponents[0].name, "Black Huckleberry");
  });

  it("validates a cart with a bundle plus standalone seeds sharing the same component", () => {
    const huckleberry = product({ id: "prod-huckleberry", name: "Black Huckleberry", inventory: 6 });
    const bundle = product({
      id: "prod-bundle",
      name: "Wildlife Habitat Seed Collection",
      productType: "bundle",
      bundleComponents: [component(huckleberry)]
    });
    const pack100 = variant({ id: "var-100", name: "100 Seeds", packsConsumed: 4 });

    assert.equal(validateCartInventory([
      { product: bundle, quantity: 1 },
      { product: huckleberry, variant: pack100, quantity: 1 }
    ]).valid, true);
  });

  it("blocks a cart when bundle and standalone seed needs exceed the shared pack pool", () => {
    const huckleberry = product({ id: "prod-huckleberry", name: "Black Huckleberry", inventory: 6 });
    const bundle = product({
      id: "prod-bundle",
      name: "Wildlife Habitat Seed Collection",
      productType: "bundle",
      bundleComponents: [component(huckleberry)]
    });
    const pack100 = variant({ id: "var-100", name: "100 Seeds", packsConsumed: 4 });
    const pack50 = variant({ id: "var-50", name: "50 Seeds", packsConsumed: 2 });
    const validation = validateCartInventory([
      { product: bundle, quantity: 1 },
      { product: huckleberry, variant: pack100, quantity: 1 },
      { product: huckleberry, variant: pack50, quantity: 1 }
    ]);

    assert.equal(validation.valid, false);
    assert.match(validation.errors[0], /Only 6 25-seed packs of Black Huckleberry/);
  });

  it("leaves existing non-seed variant inventory independent", () => {
    const chestnut = product({
      id: "prod-chestnut",
      name: "Korean XL Chestnut Tree",
      category: "Plants",
      inventory: 37
    });
    const oneTree = variant({ id: "var-one", name: "One Tree", inventory: 32, packsConsumed: 1 });
    const fiveTrees = variant({ id: "var-five", name: "Five Trees", inventory: 5, packsConsumed: 1 });

    assert.equal(getProductAvailableInventory(chestnut, oneTree), 32);
    assert.equal(validateCartInventory([{ product: chestnut, variant: fiveTrees, quantity: 5 }]).valid, true);
    assert.equal(validateCartInventory([{ product: chestnut, variant: fiveTrees, quantity: 6 }]).valid, false);
  });
});
