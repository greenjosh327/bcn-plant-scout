"use client";

import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { Session } from "@supabase/supabase-js";
import { hasSupabaseBrowserConfig, supabase } from "@/lib/supabase-browser";
import {
  formatAddressValidationStatus,
  formatOrderShippingMethod,
  formatShippingAddress,
  formatShippingCarrierService,
  formatShippingProvider
} from "@/lib/shipping/order-display";
import {
  formatLabelPurchaseStatus,
  getLabelPurchaseEligibility,
  hasPurchasedShippingLabels,
  type LabelPurchaseStatus
} from "@/lib/shipping/label-purchase";
import {
  SHIPPING_CLASS_DESCRIPTIONS,
  SHIPPING_CLASS_LABELS,
  SHIPPING_CLASSES,
  canUseGroundAdvantage,
  requiresPackageData,
  type ShippingClass,
  type ShippingPackagePreset
} from "@/lib/shipping/types";

type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  scientific_name: string | null;
  common_name: string | null;
  category: "Plants" | "Cuttings" | "Seeds";
  description: string;
  price: number;
  inventory: number;
  featured: boolean;
  active: boolean;
  ships: boolean;
  local_pickup: boolean;
  shipping_class: ShippingClass | null;
  shipping_enabled: boolean;
  local_pickup_enabled: boolean;
  packed_weight_oz: number | null;
  packed_length_in: number | null;
  packed_width_in: number | null;
  packed_height_in: number | null;
  ships_alone: boolean;
  expedited_required: boolean;
  allow_ground_advantage: boolean;
  free_shipping_eligible: boolean;
  shipping_surcharge_cents: number;
  max_quantity_per_package: number;
  preferred_package_id: string | null;
  shipping_configuration_complete: boolean;
  native_status: string | null;
  hardiness_zones: string | null;
  sunlight: string | null;
  soil: string | null;
  height: string | null;
  spread: string | null;
  bloom_time: string | null;
  wildlife_benefits: string | null;
  pollinator_benefits: string | null;
  host_species: string | null;
  growing_notes: string | null;
  planting_instructions: string | null;
  shipping_notes: string | null;
  show_hardiness_zones: boolean | null;
  show_sunlight: boolean | null;
  show_soil: boolean | null;
  show_bloom_time: boolean | null;
  show_height: boolean | null;
  show_spread: boolean | null;
  show_native_status: boolean | null;
  show_wildlife_benefits: boolean | null;
  show_pollinator_benefits: boolean | null;
  show_host_species: boolean | null;
  tags: string[] | null;
};

type CatalogVariant = {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price: number;
  inventory: number;
  active: boolean;
};

type CatalogImage = {
  id: string;
  product_id: string;
  storage_path: string | null;
  public_url: string | null;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
};

type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  sku: string | null;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type ShopOrder = {
  id: string;
  stripe_session_id: string;
  stripe_payment_intent: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
  customer_name: string | null;
  customer_email: string | null;
  phone: string | null;
  order_status: "new" | "ready_for_pickup" | "shipped" | "fulfilled" | "cancelled" | "refunded";
  payment_status: "paid" | "unpaid" | "no_payment_required" | "refunded" | "failed";
  fulfillment_type: "pickup" | "shipping";
  pickup_location: string | null;
  shipping_address: Record<string, unknown> | null;
  shipping_quote_id: string | null;
  shipping_method_code: string | null;
  shipping_method_name: string | null;
  shipping_provider: string | null;
  shipping_carrier: string | null;
  shipping_service: string | null;
  shipping_amount_cents: number | null;
  address_validation_status: string | null;
  validated_shipping_address: Record<string, unknown> | null;
  untracked_shipping_acknowledged: boolean | null;
  package_plan: Array<Record<string, unknown>> | null;
  shippo_shipment_ids: string[] | null;
  shippo_rate_ids: string[] | null;
  estimated_delivery: string | null;
  internal_shipping_notes: string | null;
  label_purchase_status: LabelPurchaseStatus | string | null;
  label_provider: string | null;
  label_transaction_ids: string[] | null;
  label_rate_ids: string[] | null;
  label_urls: string[] | null;
  label_file_type: string | null;
  label_purchase_test_mode: boolean | null;
  label_purchased_at: string | null;
  label_purchase_error: string | null;
  label_metadata: Record<string, unknown> | null;
  tracking_numbers: string[] | null;
  tracking_urls: string[] | null;
  tracking_status: string | null;
  subtotal: number;
  shipping_cost: number;
  tax: number;
  total: number;
  currency: string;
  notes: string | null;
  fulfilled_at: string | null;
  order_items: OrderItem[];
};

type AdminState = "checking" | "signed-out" | "not-admin" | "ready" | "missing-config";
type AdminTab = "orders" | "catalog";
type CatalogFilter = "all" | "needsPhotos" | "lowStock" | "soldOut" | "hidden";
const PRODUCT_IMAGE_BUCKET = "product-images";
const LOW_STOCK_THRESHOLD = 5;
const CUSTOM_GROWING_VALUE = "__custom_growing_value__";

type GrowingTextKey =
  | "hardiness_zones"
  | "sunlight"
  | "soil"
  | "bloom_time"
  | "height"
  | "spread"
  | "native_status"
  | "wildlife_benefits"
  | "pollinator_benefits"
  | "host_species";

type GrowingDisplayKey =
  | "show_hardiness_zones"
  | "show_sunlight"
  | "show_soil"
  | "show_bloom_time"
  | "show_height"
  | "show_spread"
  | "show_native_status"
  | "show_wildlife_benefits"
  | "show_pollinator_benefits"
  | "show_host_species";

type CatalogForm = {
  name: string;
  slug: string;
  scientific_name: string;
  common_name: string;
  category: CatalogProduct["category"];
  description: string;
  price: string;
  inventory: string;
  featured: boolean;
  active: boolean;
  ships: boolean;
  local_pickup: boolean;
  shipping_class: ShippingClass | "";
  shipping_enabled: boolean;
  local_pickup_enabled: boolean;
  packed_weight_oz: string;
  packed_length_in: string;
  packed_width_in: string;
  packed_height_in: string;
  ships_alone: boolean;
  expedited_required: boolean;
  allow_ground_advantage: boolean;
  free_shipping_eligible: boolean;
  shipping_surcharge: string;
  max_quantity_per_package: string;
  preferred_package_id: string;
  shipping_configuration_complete: boolean;
  tags: string;
  native_status: string;
  hardiness_zones: string;
  sunlight: string;
  soil: string;
  height: string;
  spread: string;
  bloom_time: string;
  wildlife_benefits: string;
  pollinator_benefits: string;
  host_species: string;
  growing_notes: string;
  planting_instructions: string;
  shipping_notes: string;
  show_hardiness_zones: boolean;
  show_sunlight: boolean;
  show_soil: boolean;
  show_bloom_time: boolean;
  show_height: boolean;
  show_spread: boolean;
  show_native_status: boolean;
  show_wildlife_benefits: boolean;
  show_pollinator_benefits: boolean;
  show_host_species: boolean;
};

type GrowingSelectConfig = {
  label: string;
  field: GrowingTextKey;
  showField: GrowingDisplayKey;
  options: readonly string[];
  customPlaceholder?: string;
};

const GROWING_SELECT_FIELDS: GrowingSelectConfig[] = [
  {
    label: "Hardiness",
    field: "hardiness_zones",
    showField: "show_hardiness_zones",
    options: ["Zone 2", "Zone 3", "Zone 4", "Zone 5", "Zone 6", "Zone 7", "Zone 8", "Zone 9", "Zone 10"],
    customPlaceholder: "Custom range"
  },
  {
    label: "Sun",
    field: "sunlight",
    showField: "show_sunlight",
    options: ["Full Sun", "Full Sun to Part Shade", "Part Sun", "Part Shade", "Full Shade"]
  },
  {
    label: "Soil",
    field: "soil",
    showField: "show_soil",
    options: ["Adaptable", "Well-drained", "Moist, well-drained", "Moist", "Wet", "Dry", "Sandy", "Loamy", "Clay tolerant", "Poor soil tolerant"]
  },
  {
    label: "Bloom or Harvest Season",
    field: "bloom_time",
    showField: "show_bloom_time",
    options: ["Early Spring", "Spring", "Late Spring", "Summer", "Late Summer", "Fall", "Winter", "Does Not Apply"]
  },
  {
    label: "Mature Height",
    field: "height",
    showField: "show_height",
    options: ["Does Not Apply", "Under 1 ft", "1-3 ft", "3-6 ft", "6-10 ft", "10-25 ft", "25-50 ft", "50+ ft"],
    customPlaceholder: "Custom height"
  },
  {
    label: "Spacing",
    field: "spread",
    showField: "show_spread",
    options: ["Does Not Apply", "6-12 in", "12-18 in", "18-24 in", "2-3 ft", "3-6 ft", "6-10 ft", "10+ ft"],
    customPlaceholder: "Custom spacing"
  },
  {
    label: "Native Range",
    field: "native_status",
    showField: "show_native_status",
    options: ["Pennsylvania native", "Eastern North America", "Northeastern North America", "North America", "Non-native", "Cultivated variety", "Does Not Apply"],
    customPlaceholder: "Custom native range"
  },
  {
    label: "Wildlife Value",
    field: "wildlife_benefits",
    showField: "show_wildlife_benefits",
    options: ["Low", "Moderate", "High", "Very High"]
  },
  {
    label: "Pollinator Value",
    field: "pollinator_benefits",
    showField: "show_pollinator_benefits",
    options: ["None", "Low", "Moderate", "High"]
  },
  {
    label: "Host Plant Information",
    field: "host_species",
    showField: "show_host_species",
    options: ["Not Known", "Yes", "No"],
    customPlaceholder: "Custom notes"
  }
];

const emptyForm: CatalogForm = {
  name: "",
  slug: "",
  scientific_name: "",
  common_name: "",
  category: "Seeds" as CatalogProduct["category"],
  description: "",
  price: "0",
  inventory: "0",
  featured: false,
  active: true,
  ships: true,
  local_pickup: false,
  shipping_class: "",
  shipping_enabled: true,
  local_pickup_enabled: false,
  packed_weight_oz: "",
  packed_length_in: "",
  packed_width_in: "",
  packed_height_in: "",
  ships_alone: false,
  expedited_required: false,
  allow_ground_advantage: true,
  free_shipping_eligible: false,
  shipping_surcharge: "0",
  max_quantity_per_package: "1",
  preferred_package_id: "",
  shipping_configuration_complete: false,
  tags: "",
  native_status: "",
  hardiness_zones: "",
  sunlight: "",
  soil: "",
  height: "",
  spread: "",
  bloom_time: "",
  wildlife_benefits: "",
  pollinator_benefits: "",
  host_species: "",
  growing_notes: "",
  planting_instructions: "",
  shipping_notes: "",
  show_hardiness_zones: true,
  show_sunlight: true,
  show_soil: true,
  show_bloom_time: true,
  show_height: true,
  show_spread: true,
  show_native_status: true,
  show_wildlife_benefits: true,
  show_pollinator_benefits: true,
  show_host_species: true
};

export function AdminCatalogEditor() {
  const [state, setState] = useState<AdminState>("checking");
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [variants, setVariants] = useState<CatalogVariant[]>([]);
  const [images, setImages] = useState<CatalogImage[]>([]);
  const [packagePresets, setPackagePresets] = useState<ShippingPackagePreset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("orders");
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>("all");

  const selected = products.find((product) => product.id === selectedId) ?? null;
  const selectedVariants = variants.filter((variant) => variant.product_id === selectedId);
  const selectedImages = images
    .filter((image) => image.product_id === selectedId)
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order);
  const shippingValidation = useMemo(() => validateProductShipping(form), [form]);

  const productImageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    images.forEach((image) => counts.set(image.product_id, (counts.get(image.product_id) ?? 0) + 1));
    return counts;
  }, [images]);

  const productVariantStats = useMemo(() => {
    const stats = new Map<string, { active: number; total: number; inventory: number; lowStock: number; soldOut: number }>();

    products.forEach((product) => {
      stats.set(product.id, { active: 0, total: 0, inventory: 0, lowStock: 0, soldOut: 0 });
    });

    variants.forEach((variant) => {
      const current = stats.get(variant.product_id) ?? { active: 0, total: 0, inventory: 0, lowStock: 0, soldOut: 0 };
      const inventory = Math.max(0, Number(variant.inventory) || 0);

      current.total += 1;
      if (variant.active) {
        current.active += 1;
        current.inventory += inventory;
        if (inventory === 0) current.soldOut += 1;
        if (inventory > 0 && inventory <= LOW_STOCK_THRESHOLD) current.lowStock += 1;
      }

      stats.set(variant.product_id, current);
    });

    return stats;
  }, [products, variants]);

  function getInventoryForProduct(product: CatalogProduct) {
    const stats = productVariantStats.get(product.id);
    if (stats && stats.active > 0) return stats.inventory;
    return Math.max(0, Number(product.inventory) || 0);
  }

  function productNeedsPhoto(product: CatalogProduct) {
    return (productImageCounts.get(product.id) ?? 0) === 0;
  }

  function productIsSoldOut(product: CatalogProduct) {
    return product.active && getInventoryForProduct(product) <= 0;
  }

  function productIsLowStock(product: CatalogProduct) {
    const inventory = getInventoryForProduct(product);
    return product.active && inventory > 0 && inventory <= LOW_STOCK_THRESHOLD;
  }

  const catalogStats = useMemo(() => {
    let productsWithoutPhotos = 0;
    let productsNeedingShippingSetup = 0;
    let lowStockProducts = 0;
    let soldOutProducts = 0;
    let lowStockVariants = 0;
    let soldOutVariants = 0;

    products.forEach((product) => {
      const inventory = getInventoryForProduct(product);
      if ((productImageCounts.get(product.id) ?? 0) === 0) productsWithoutPhotos += 1;
      if (!product.shipping_configuration_complete) productsNeedingShippingSetup += 1;
      if (product.active && inventory > 0 && inventory <= LOW_STOCK_THRESHOLD) lowStockProducts += 1;
      if (product.active && inventory <= 0) soldOutProducts += 1;
    });

    variants.forEach((variant) => {
      if (!variant.active) return;
      const inventory = Math.max(0, Number(variant.inventory) || 0);
      if (inventory === 0) soldOutVariants += 1;
      if (inventory > 0 && inventory <= LOW_STOCK_THRESHOLD) lowStockVariants += 1;
    });

    return {
      totalProducts: products.length,
      activeProducts: products.filter((product) => product.active).length,
      hiddenProducts: products.filter((product) => !product.active).length,
      productsWithoutPhotos,
      productsNeedingShippingSetup,
      lowStockProducts,
      soldOutProducts,
      totalVariants: variants.length,
      lowStockVariants,
      soldOutVariants
    };
  }, [products, variants, productImageCounts, productVariantStats]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch =
        !term ||
        [product.name, product.scientific_name, product.common_name, product.category, product.slug]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term);

      if (!matchesSearch) return false;

      if (catalogFilter === "needsPhotos") return productNeedsPhoto(product);
      if (catalogFilter === "lowStock") return productIsLowStock(product);
      if (catalogFilter === "soldOut") return productIsSoldOut(product);
      if (catalogFilter === "hidden") return !product.active;
      return true;
    });
  }, [products, search, catalogFilter, productImageCounts, productVariantStats]);

  useEffect(() => {
    if (!hasSupabaseBrowserConfig() || !supabase) {
      setState("missing-config");
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) {
        setState("signed-out");
        return;
      }
      void verifyAdminAndLoad(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setState("signed-out");
        setProducts([]);
        setVariants([]);
        setImages([]);
        setPackagePresets([]);
        return;
      }
      void verifyAdminAndLoad(nextSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!selected) return;
    setForm({
      name: selected.name,
      slug: selected.slug,
      scientific_name: selected.scientific_name ?? "",
      common_name: selected.common_name ?? "",
      category: selected.category,
      description: selected.description ?? "",
      price: String(selected.price ?? 0),
      inventory: String(selected.inventory ?? 0),
      featured: selected.featured,
      active: selected.active,
      ships: selected.ships,
      local_pickup: selected.local_pickup,
      shipping_class: selected.shipping_class ?? "",
      shipping_enabled: Boolean(selected.shipping_enabled),
      local_pickup_enabled: selected.local_pickup_enabled !== false,
      packed_weight_oz: numberToFormValue(selected.packed_weight_oz),
      packed_length_in: numberToFormValue(selected.packed_length_in),
      packed_width_in: numberToFormValue(selected.packed_width_in),
      packed_height_in: numberToFormValue(selected.packed_height_in),
      ships_alone: Boolean(selected.ships_alone),
      expedited_required: Boolean(selected.expedited_required),
      allow_ground_advantage: selected.allow_ground_advantage !== false,
      free_shipping_eligible: Boolean(selected.free_shipping_eligible),
      shipping_surcharge: centsToFormDollars(selected.shipping_surcharge_cents),
      max_quantity_per_package: String(selected.max_quantity_per_package ?? 1),
      preferred_package_id: selected.preferred_package_id ?? "",
      shipping_configuration_complete: Boolean(selected.shipping_configuration_complete),
      tags: (selected.tags ?? []).join(", "),
      native_status: cleanEditableText(selected.native_status),
      hardiness_zones: cleanEditableText(selected.hardiness_zones),
      sunlight: cleanEditableText(selected.sunlight),
      soil: cleanEditableText(selected.soil),
      height: cleanEditableText(selected.height),
      spread: cleanEditableText(selected.spread),
      bloom_time: cleanEditableText(selected.bloom_time),
      wildlife_benefits: cleanEditableText(selected.wildlife_benefits),
      pollinator_benefits: cleanEditableText(selected.pollinator_benefits),
      host_species: cleanEditableText(selected.host_species),
      growing_notes: cleanEditableText(selected.growing_notes),
      planting_instructions: cleanEditableText(selected.planting_instructions),
      shipping_notes: cleanEditableText(selected.shipping_notes),
      show_hardiness_zones: selected.show_hardiness_zones !== false,
      show_sunlight: selected.show_sunlight !== false,
      show_soil: selected.show_soil !== false,
      show_bloom_time: selected.show_bloom_time !== false,
      show_height: selected.show_height !== false,
      show_spread: selected.show_spread !== false,
      show_native_status: selected.show_native_status !== false,
      show_wildlife_benefits: selected.show_wildlife_benefits !== false,
      show_pollinator_benefits: selected.show_pollinator_benefits !== false,
      show_host_species: selected.show_host_species !== false
    });
  }, [selected]);

  async function verifyAdminAndLoad(nextSession: Session) {
    if (!supabase) return;
    setState("checking");
    const { data: admin, error } = await supabase
      .from("bcn_admins")
      .select("user_id")
      .eq("user_id", nextSession.user.id)
      .maybeSingle();

    if (error || !admin) {
      setState("not-admin");
      setMessage(error?.message ?? "Signed in, but this account is not listed as a BCN admin.");
      return;
    }

    setState("ready");
    await loadCatalog();
  }

  async function loadCatalog() {
    if (!supabase) return;
    setMessage("Loading catalog...");
    const [
      { data: productRows, error: productError },
      { data: variantRows, error: variantError },
      { data: imageRows, error: imageError },
      { data: packagePresetRows, error: packagePresetError }
    ] = await Promise.all([
      supabase.from("products").select("*").order("name", { ascending: true }),
      supabase.from("product_variants").select("*").order("name", { ascending: true }),
      supabase.from("product_images").select("*").order("sort_order", { ascending: true }),
      supabase.from("shipping_package_presets").select("*").order("sort_order", { ascending: true })
    ]);

    if (productError || variantError || imageError || packagePresetError) {
      setMessage(productError?.message ?? variantError?.message ?? imageError?.message ?? packagePresetError?.message ?? "Could not load catalog.");
      return;
    }

    setProducts((productRows ?? []) as CatalogProduct[]);
    setVariants((variantRows ?? []) as CatalogVariant[]);
    setImages((imageRows ?? []) as CatalogImage[]);
    setPackagePresets((packagePresetRows ?? []) as ShippingPackagePreset[]);
    setSelectedId((current) => current ?? productRows?.[0]?.id ?? null);
    setMessage(`Loaded ${productRows?.length ?? 0} products.`);
  }

  async function signIn() {
    if (!supabase) return;
    setMessage("Signing in...");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
  }

  async function signInWithGoogle() {
    if (!supabase) return;
    setMessage("Opening Google sign in...");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/admin`
      }
    });
    if (error) setMessage(error.message);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  async function saveProduct() {
    if (!supabase || !selected) return;
    const nextShippingValidation = validateProductShipping(form);
    if (nextShippingValidation.errors.length > 0) {
      setMessage(nextShippingValidation.errors[0]);
      return;
    }

    setSaving(true);
    setMessage("Saving product...");
    const tags = form.tags
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
    const shippingConfigurationComplete = nextShippingValidation.complete;

    const { error } = await supabase
      .from("products")
      .update({
        name: form.name,
        slug: form.slug,
        scientific_name: form.scientific_name || null,
        common_name: form.common_name || null,
        category: form.category,
        description: form.description,
        price: Number(form.price) || 0,
        inventory: Number(form.inventory) || 0,
        featured: form.featured,
        active: form.active,
        ships: form.shipping_enabled,
        local_pickup: form.local_pickup_enabled,
        shipping_class: form.shipping_class || null,
        shipping_enabled: form.shipping_enabled,
        local_pickup_enabled: form.local_pickup_enabled,
        packed_weight_oz: form.shipping_class === "digital" || form.shipping_class === "oversized_pickup_only" ? null : formNumberToDb(form.packed_weight_oz),
        packed_length_in: shouldClearPackageDimensions(form) ? null : formNumberToDb(form.packed_length_in),
        packed_width_in: shouldClearPackageDimensions(form) ? null : formNumberToDb(form.packed_width_in),
        packed_height_in: shouldClearPackageDimensions(form) ? null : formNumberToDb(form.packed_height_in),
        ships_alone: form.ships_alone,
        expedited_required: form.shipping_class === "tree" ? true : form.expedited_required,
        allow_ground_advantage: canUseGroundAdvantage(form.shipping_class) ? form.allow_ground_advantage : false,
        free_shipping_eligible: form.free_shipping_eligible,
        shipping_surcharge_cents: dollarsToCents(form.shipping_surcharge),
        max_quantity_per_package: Math.max(1, Number(form.max_quantity_per_package) || 1),
        preferred_package_id: form.preferred_package_id || null,
        shipping_configuration_complete: shippingConfigurationComplete,
        native_status: editableTextToDb(form.native_status),
        hardiness_zones: editableTextToDb(form.hardiness_zones),
        sunlight: editableTextToDb(form.sunlight),
        soil: editableTextToDb(form.soil),
        height: editableTextToDb(form.height),
        spread: editableTextToDb(form.spread),
        bloom_time: editableTextToDb(form.bloom_time),
        wildlife_benefits: editableTextToDb(form.wildlife_benefits),
        pollinator_benefits: editableTextToDb(form.pollinator_benefits),
        host_species: editableTextToDb(form.host_species),
        growing_notes: editableTextToDb(form.growing_notes),
        planting_instructions: editableTextToDb(form.planting_instructions),
        shipping_notes: editableTextToDb(form.shipping_notes),
        show_hardiness_zones: form.show_hardiness_zones,
        show_sunlight: form.show_sunlight,
        show_soil: form.show_soil,
        show_bloom_time: form.show_bloom_time,
        show_height: form.show_height,
        show_spread: form.show_spread,
        show_native_status: form.show_native_status,
        show_wildlife_benefits: form.show_wildlife_benefits,
        show_pollinator_benefits: form.show_pollinator_benefits,
        show_host_species: form.show_host_species,
        tags
      })
      .eq("id", selected.id);

    setSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setProducts((current) =>
      current.map((product) =>
        product.id === selected.id
          ? {
              ...product,
              name: form.name,
              slug: form.slug,
              scientific_name: form.scientific_name || null,
              common_name: form.common_name || null,
              category: form.category,
              description: form.description,
              price: Number(form.price) || 0,
              inventory: Number(form.inventory) || 0,
              featured: form.featured,
              active: form.active,
              ships: form.shipping_enabled,
              local_pickup: form.local_pickup_enabled,
              shipping_class: form.shipping_class || null,
              shipping_enabled: form.shipping_enabled,
              local_pickup_enabled: form.local_pickup_enabled,
              packed_weight_oz: form.shipping_class === "digital" || form.shipping_class === "oversized_pickup_only" ? null : formNumberToDb(form.packed_weight_oz),
              packed_length_in: shouldClearPackageDimensions(form) ? null : formNumberToDb(form.packed_length_in),
              packed_width_in: shouldClearPackageDimensions(form) ? null : formNumberToDb(form.packed_width_in),
              packed_height_in: shouldClearPackageDimensions(form) ? null : formNumberToDb(form.packed_height_in),
              ships_alone: form.ships_alone,
              expedited_required: form.shipping_class === "tree" ? true : form.expedited_required,
              allow_ground_advantage: canUseGroundAdvantage(form.shipping_class) ? form.allow_ground_advantage : false,
              free_shipping_eligible: form.free_shipping_eligible,
              shipping_surcharge_cents: dollarsToCents(form.shipping_surcharge),
              max_quantity_per_package: Math.max(1, Number(form.max_quantity_per_package) || 1),
              preferred_package_id: form.preferred_package_id || null,
              shipping_configuration_complete: shippingConfigurationComplete,
              native_status: editableTextToDb(form.native_status),
              hardiness_zones: editableTextToDb(form.hardiness_zones),
              sunlight: editableTextToDb(form.sunlight),
              soil: editableTextToDb(form.soil),
              height: editableTextToDb(form.height),
              spread: editableTextToDb(form.spread),
              bloom_time: editableTextToDb(form.bloom_time),
              wildlife_benefits: editableTextToDb(form.wildlife_benefits),
              pollinator_benefits: editableTextToDb(form.pollinator_benefits),
              host_species: editableTextToDb(form.host_species),
              growing_notes: editableTextToDb(form.growing_notes),
              planting_instructions: editableTextToDb(form.planting_instructions),
              shipping_notes: editableTextToDb(form.shipping_notes),
              show_hardiness_zones: form.show_hardiness_zones,
              show_sunlight: form.show_sunlight,
              show_soil: form.show_soil,
              show_bloom_time: form.show_bloom_time,
              show_height: form.show_height,
              show_spread: form.show_spread,
              show_native_status: form.show_native_status,
              show_wildlife_benefits: form.show_wildlife_benefits,
              show_pollinator_benefits: form.show_pollinator_benefits,
              show_host_species: form.show_host_species,
              tags
            }
          : product
      )
    );
    setMessage("Product saved.");
  }

  async function createProduct() {
    if (!supabase) return;
    const id = makeId("prod");
    const newProduct: CatalogProduct = {
      id,
      slug: `${slugify("new-product")}-${id.slice(-6)}`,
      name: "New product",
      scientific_name: null,
      common_name: null,
      category: "Seeds",
      description: "",
      price: 0,
      inventory: 0,
      featured: false,
      active: false,
      ships: true,
      local_pickup: true,
      shipping_class: null,
      shipping_enabled: true,
      local_pickup_enabled: true,
      packed_weight_oz: null,
      packed_length_in: null,
      packed_width_in: null,
      packed_height_in: null,
      ships_alone: false,
      expedited_required: false,
      allow_ground_advantage: true,
      free_shipping_eligible: false,
      shipping_surcharge_cents: 0,
      max_quantity_per_package: 1,
      preferred_package_id: null,
      shipping_configuration_complete: false,
      native_status: null,
      hardiness_zones: null,
      sunlight: null,
      soil: null,
      height: null,
      spread: null,
      bloom_time: null,
      wildlife_benefits: null,
      pollinator_benefits: null,
      host_species: null,
      growing_notes: null,
      planting_instructions: null,
      shipping_notes: null,
      show_hardiness_zones: true,
      show_sunlight: true,
      show_soil: true,
      show_bloom_time: true,
      show_height: true,
      show_spread: true,
      show_native_status: true,
      show_wildlife_benefits: true,
      show_pollinator_benefits: true,
      show_host_species: true,
      tags: []
    };
    setMessage("Creating product...");
    const { error } = await supabase.from("products").insert(newProduct);
    if (error) {
      setMessage(error.message);
      return;
    }
    setProducts((current) => [...current, newProduct].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedId(id);
    setMessage("New hidden product created. Edit it, then turn Active on when ready.");
  }

  async function deleteProduct() {
    if (!supabase || !selected) return;
    const confirmed = window.confirm(`Delete ${selected.name}? This removes its variants and photo rows. Existing order history stays separate.`);
    if (!confirmed) return;

    const productImages = images.filter((image) => image.product_id === selected.id);
    const storagePaths = productImages.map((image) => image.storage_path).filter(Boolean) as string[];
    setMessage("Deleting product...");

    const { error } = await supabase.from("products").delete().eq("id", selected.id);
    if (error) {
      setMessage(`${error.message}. Product was not deleted. Try turning Active off if order history is connected.`);
      return;
    }

    if (storagePaths.length) {
      await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove(storagePaths);
    }

    setProducts((current) => current.filter((product) => product.id !== selected.id));
    setVariants((current) => current.filter((variant) => variant.product_id !== selected.id));
    setImages((current) => current.filter((image) => image.product_id !== selected.id));
    setSelectedId((current) => {
      const remaining = products.filter((product) => product.id !== current);
      return remaining[0]?.id ?? null;
    });
    setMessage("Product deleted.");
  }

  async function updateVariant(variant: CatalogVariant, patch: Partial<CatalogVariant>) {
    if (!supabase) return;
    const next = { ...variant, ...patch };
    const nextVariants = variants.map((item) => (item.id === variant.id ? next : item));
    setVariants(nextVariants);
    const { error } = await supabase
      .from("product_variants")
      .update({
        name: next.name,
        sku: next.sku,
        price: Number(next.price) || 0,
        inventory: Number(next.inventory) || 0,
        active: next.active
      })
      .eq("id", variant.id);
    if (error) {
      setMessage(error.message);
      await loadCatalog();
      return;
    }
    setMessage("Inventory option saved.");
    await refreshProductInventory(next.product_id, nextVariants);
  }

  async function addVariant() {
    if (!supabase || !selected) return;
    const newVariant: CatalogVariant = {
      id: makeId("var"),
      product_id: selected.id,
      name: "New option",
      sku: "",
      price: Number(form.price) || 0,
      inventory: 0,
      active: true
    };
    setMessage("Adding inventory option...");
    const { error } = await supabase.from("product_variants").insert(newVariant);
    if (error) {
      setMessage(error.message);
      return;
    }
    const nextVariants = [...variants, newVariant];
    setVariants(nextVariants);
    await refreshProductInventory(selected.id, nextVariants);
    setMessage("Inventory option added.");
  }

  async function deleteVariant(variant: CatalogVariant) {
    if (!supabase) return;
    const confirmed = window.confirm(`Delete option "${variant.name}"?`);
    if (!confirmed) return;
    const { error } = await supabase.from("product_variants").delete().eq("id", variant.id);
    if (error) {
      setMessage(`${error.message}. Marking option inactive instead.`);
      await updateVariant(variant, { active: false, inventory: 0 });
      return;
    }
    const nextVariants = variants.filter((item) => item.id !== variant.id);
    setVariants(nextVariants);
    await refreshProductInventory(variant.product_id, nextVariants);
    setMessage("Inventory option deleted.");
  }

  async function uploadProductImage(event: React.ChangeEvent<HTMLInputElement>) {
    if (!supabase || !selected) return;
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!files.length) return;

    setUploadingImage(true);
    setMessage(`Uploading ${files.length} product photo${files.length === 1 ? "" : "s"}...`);

    const uploadedImages: CatalogImage[] = [];
    const uploadedPaths: string[] = [];

    for (const [index, file] of files.entries()) {
      const path = `products/${selected.id}/${Date.now()}-${index}-${safeFileName(file.name)}`;
      const upload = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, file, {
        cacheControl: "3600",
        contentType: file.type || "image/jpeg",
        upsert: false
      });

      if (upload.error) {
        if (uploadedPaths.length) {
          await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove(uploadedPaths);
        }
        setUploadingImage(false);
        setMessage(upload.error.message);
        return;
      }

      uploadedPaths.push(path);
      const { data: publicData } = supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
      uploadedImages.push({
        id: makeId("img"),
        product_id: selected.id,
        storage_path: path,
        public_url: publicData.publicUrl,
        alt_text: selected.name,
        sort_order: selectedImages.length + index,
        is_primary: selectedImages.length === 0 && index === 0
      });
    }

    const { error } = await supabase.from("product_images").insert(uploadedImages);
    setUploadingImage(false);
    if (error) {
      await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove(uploadedPaths);
      setMessage(error.message);
      return;
    }
    setImages((current) => [...current, ...uploadedImages]);
    setMessage(
      selectedImages.length === 0
        ? `${uploadedImages.length} photo${uploadedImages.length === 1 ? "" : "s"} uploaded. First photo set as primary.`
        : `${uploadedImages.length} photo${uploadedImages.length === 1 ? "" : "s"} uploaded.`
    );
  }

  async function setPrimaryImage(image: CatalogImage) {
    if (!supabase || !selected) return;
    setMessage("Updating primary photo...");
    const clear = await supabase.from("product_images").update({ is_primary: false }).eq("product_id", selected.id);
    if (clear.error) {
      setMessage(clear.error.message);
      return;
    }
    const setPrimary = await supabase.from("product_images").update({ is_primary: true }).eq("id", image.id);
    if (setPrimary.error) {
      setMessage(setPrimary.error.message);
      return;
    }
    setImages((current) =>
      current.map((item) => (item.product_id === selected.id ? { ...item, is_primary: item.id === image.id } : item))
    );
    setMessage("Primary photo updated.");
  }

  async function updateImageAltText(image: CatalogImage, altText: string) {
    if (!supabase) return;
    setImages((current) => current.map((item) => (item.id === image.id ? { ...item, alt_text: altText } : item)));
    const { error } = await supabase.from("product_images").update({ alt_text: altText || null }).eq("id", image.id);
    if (error) {
      setMessage(error.message);
      await loadCatalog();
      return;
    }
    setMessage("Photo note saved.");
  }

  async function deleteImage(image: CatalogImage) {
    if (!supabase) return;
    const confirmed = window.confirm("Delete this product photo?");
    if (!confirmed) return;
    const { error } = await supabase.from("product_images").delete().eq("id", image.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    if (image.storage_path) {
      await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([image.storage_path]);
    }
    const remainingImages = images.filter((item) => item.product_id === image.product_id && item.id !== image.id);
    if (image.is_primary && remainingImages.length > 0) {
      await supabase.from("product_images").update({ is_primary: true }).eq("id", remainingImages[0].id);
      remainingImages[0] = { ...remainingImages[0], is_primary: true };
    }
    setImages((current) => current.filter((item) => item.id !== image.id).map((item) => remainingImages.find((next) => next.id === item.id) ?? item));
    setMessage("Product photo deleted.");
  }

  async function refreshProductInventory(productId: string, variantRows = variants) {
    if (!supabase) return;
    const currentVariants = variantRows.filter((variant) => variant.product_id === productId);
    const inventory = currentVariants.reduce((sum, variant) => sum + Math.max(0, Number(variant.inventory) || 0), 0);
    await supabase.from("products").update({ inventory }).eq("id", productId);
    setProducts((current) => current.map((product) => (product.id === productId ? { ...product, inventory } : product)));
  }

  if (state === "missing-config") {
    return <AdminShell title="Admin setup needed">Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to Vercel and local `.env.local`.</AdminShell>;
  }

  if (state === "checking") {
    return <AdminShell title="Checking access">Looking for your admin session...</AdminShell>;
  }

  if (state === "signed-out") {
    return (
      <AdminShell title="Owner sign in">
        <div className="mt-6 grid gap-4">
          <input className="admin-input" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <input className="admin-input" placeholder="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <button className="button button-primary" onClick={signIn}>Sign In</button>
          <button className="button button-secondary" onClick={signInWithGoogle}>Sign In With Google</button>
          {message ? <p className="text-sm font-bold text-rust">{message}</p> : null}
        </div>
      </AdminShell>
    );
  }

  if (state === "not-admin") {
    return (
      <AdminShell title="Not an admin yet">
        <p className="mt-4 leading-7 text-ink/75">{message}</p>
        <p className="mt-4 text-sm font-bold text-stone">Add this user id to `public.bcn_admins` in Supabase:</p>
        <code className="mt-2 block rounded-md bg-sage p-3 text-sm text-pine">{session?.user.id}</code>
        <button className="button button-secondary mt-6" onClick={signOut}>Sign Out</button>
      </AdminShell>
    );
  }

  return (
    <main className="container py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-stone">Owner admin</p>
          <h1 className="mt-3 text-5xl font-black text-pine">{activeTab === "orders" ? "Orders" : "Catalog editor"}</h1>
          <p className="mt-4 text-ink/70">Signed in as {session?.user.email}</p>
        </div>
        <button className="button button-secondary" onClick={signOut}>Sign Out</button>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          className={`button ${activeTab === "orders" ? "button-primary" : "button-secondary"}`}
          onClick={() => setActiveTab("orders")}
        >
          Orders
        </button>
        <button
          className={`button ${activeTab === "catalog" ? "button-primary" : "button-secondary"}`}
          onClick={() => setActiveTab("catalog")}
        >
          Catalog
        </button>
      </div>

      {activeTab === "orders" ? (
        <AdminOrdersDashboard session={session} />
      ) : (
      <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
        <aside className="field-card p-4">
          <input className="admin-input" placeholder="Search catalog..." value={search} onChange={(event) => setSearch(event.target.value)} />
          <button className="button button-secondary mt-3 w-full" onClick={loadCatalog}>Refresh</button>
          <button className="button button-primary mt-3 w-full" onClick={createProduct}>Add Product</button>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <CatalogMetric label="products" value={catalogStats.totalProducts} />
            <CatalogMetric label="active" value={catalogStats.activeProducts} />
            <CatalogMetric label="needs photo" value={catalogStats.productsWithoutPhotos} tone={catalogStats.productsWithoutPhotos > 0 ? "attention" : "normal"} />
            <CatalogMetric label="shipping setup" value={catalogStats.productsNeedingShippingSetup} tone={catalogStats.productsNeedingShippingSetup > 0 ? "attention" : "normal"} />
            <CatalogMetric label="low stock" value={catalogStats.lowStockProducts} tone={catalogStats.lowStockProducts > 0 ? "attention" : "normal"} />
            <CatalogMetric label="sold out" value={catalogStats.soldOutProducts} tone={catalogStats.soldOutProducts > 0 ? "attention" : "normal"} />
            <CatalogMetric label="hidden" value={catalogStats.hiddenProducts} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {([
              ["all", "All"],
              ["needsPhotos", "Needs Photo"],
              ["lowStock", "Low Stock"],
              ["soldOut", "Sold Out"],
              ["hidden", "Hidden"]
            ] as const).map(([nextFilter, label]) => (
              <button
                key={nextFilter}
                className={`rounded-full border px-3 py-2 text-xs font-black ${catalogFilter === nextFilter ? "border-pine bg-pine text-white" : "border-pine/20 bg-sage text-pine"}`}
                onClick={() => setCatalogFilter(nextFilter)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-md border border-pine/15 bg-sage/35 p-3 text-xs font-bold leading-5 text-stone">
            Variants: {catalogStats.totalVariants} total, {catalogStats.lowStockVariants} low stock, {catalogStats.soldOutVariants} sold out.
          </div>

          <div className="mt-4 max-h-[720px] overflow-y-auto pr-1">
            {filteredProducts.map((product) => {
              const inventory = getInventoryForProduct(product);
              const needsPhoto = productNeedsPhoto(product);
              const isLowStock = productIsLowStock(product);
              const isSoldOut = productIsSoldOut(product);

              return (
                <button
                  key={product.id}
                  className={`mb-2 w-full rounded-md border p-3 text-left ${product.id === selectedId ? "border-pine bg-sage" : "border-pine/15 bg-white"}`}
                  onClick={() => setSelectedId(product.id)}
                >
                  <p className="font-black text-pine">{product.name}</p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-stone">
                    {product.category} / {inventory} available / {product.active ? "active" : "hidden"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {needsPhoto ? <AttentionBadge tone="rust">Needs photo</AttentionBadge> : null}
                    {!product.shipping_configuration_complete ? <AttentionBadge tone="rust">Shipping setup</AttentionBadge> : null}
                    {isLowStock ? <AttentionBadge tone="rust">Low stock</AttentionBadge> : null}
                    {isSoldOut ? <AttentionBadge tone="rust">Sold out</AttentionBadge> : null}
                    {!product.active ? <AttentionBadge>Hidden</AttentionBadge> : null}
                  </div>
                </button>
              );
            })}
            {filteredProducts.length === 0 ? (
              <p className="rounded-md border border-dashed border-pine/20 bg-sage/35 p-4 text-sm font-bold text-stone">
                No products match this search and filter.
              </p>
            ) : null}
          </div>
        </aside>

        <section className="field-card p-6">
          {selected ? (
            <div className="grid gap-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Product name"><input className="admin-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
                <Field label="Slug"><input className="admin-input" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} /></Field>
                <Field label="Common name"><input className="admin-input" value={form.common_name} onChange={(event) => setForm({ ...form, common_name: event.target.value })} /></Field>
                <Field label="Scientific name"><input className="admin-input" value={form.scientific_name} onChange={(event) => setForm({ ...form, scientific_name: event.target.value })} /></Field>
                <Field label="Category">
                  <select className="admin-input" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as CatalogProduct["category"] })}>
                    <option>Seeds</option>
                    <option>Plants</option>
                    <option>Cuttings</option>
                  </select>
                </Field>
                <Field label="Base price"><input className="admin-input" type="number" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></Field>
              </div>

              <Field label="Description">
                <textarea className="admin-input min-h-44" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
              </Field>

              <Field label="Tags">
                <input className="admin-input" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} />
              </Field>

              <div>
                <h2 className="text-2xl font-black text-pine">Growing information</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {GROWING_SELECT_FIELDS.map((field) => (
                    <GrowingSelectField
                      key={field.field}
                      config={field}
                      value={form[field.field]}
                      visible={form[field.showField]}
                      onValueChange={(value) => setForm((current) => ({ ...current, [field.field]: value }))}
                      onVisibleChange={(visible) => setForm((current) => ({ ...current, [field.showField]: visible }))}
                    />
                  ))}
                </div>
                <div className="mt-4 grid gap-4">
                  <Field label="Growing Notes">
                    <textarea className="admin-input min-h-28" value={form.growing_notes} onChange={(event) => setForm({ ...form, growing_notes: event.target.value })} />
                  </Field>
                  <Field label="Planting or Germination Instructions">
                    <textarea className="admin-input min-h-28" value={form.planting_instructions} onChange={(event) => setForm({ ...form, planting_instructions: event.target.value })} />
                  </Field>
                </div>
              </div>

              <ShippingProductSection
                form={form}
                packagePresets={packagePresets}
                validation={shippingValidation}
                setForm={setForm}
              />

              <div className="flex flex-wrap gap-3">
                <Toggle label="Active" checked={form.active} onChange={(checked) => setForm({ ...form, active: checked })} />
                <Toggle label="Featured" checked={form.featured} onChange={(checked) => setForm({ ...form, featured: checked })} />
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-2xl font-black text-pine">Product photos</h2>
                  <label className="button button-secondary cursor-pointer">
                    {uploadingImage ? "Uploading..." : "Upload Photos"}
                    <input className="hidden" type="file" accept="image/*" multiple disabled={uploadingImage} onChange={uploadProductImage} />
                  </label>
                </div>
                <p className="mt-2 text-sm text-ink/70">
                  Upload JPG, PNG, or WebP. The first photo becomes the shop image unless you choose another primary.
                </p>
                {selectedImages.length ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {selectedImages.map((image) => (
                      <article key={image.id} className="rounded-md border border-pine/15 bg-sage/45 p-3">
                        {image.public_url ? (
                          <img className="h-40 w-full rounded-md object-cover" src={image.public_url} alt={image.alt_text ?? selected.name} />
                        ) : (
                          <div className="grid h-40 place-items-center rounded-md bg-white text-sm font-bold text-stone">No preview URL</div>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button className="rounded-full bg-white px-3 py-1 text-xs font-black text-pine" onClick={() => setPrimaryImage(image)}>
                            {image.is_primary ? "Primary" : "Make primary"}
                          </button>
                          <button className="rounded-full bg-white px-3 py-1 text-xs font-black text-rust" onClick={() => deleteImage(image)}>
                            Delete
                          </button>
                        </div>
                        <label className="mt-3 block text-xs font-black uppercase tracking-[0.12em] text-stone">
                          Photo note
                          <input
                            className="admin-input mt-1 text-sm normal-case tracking-normal"
                            value={image.alt_text ?? ""}
                            onChange={(event) => updateImageAltText(image, event.target.value)}
                            placeholder={selected.name}
                          />
                        </label>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 rounded-md border border-dashed border-pine/20 bg-sage/35 p-4 text-sm font-bold text-stone">
                    No product photos yet. Upload one here and it will feed the shop product card.
                  </p>
                )}
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-2xl font-black text-pine">Inventory options</h2>
                  <button className="button button-secondary" onClick={addVariant}>Add Option</button>
                </div>
                <div className="mt-4 grid gap-3">
                  {selectedVariants.map((variant) => (
                    <VariantEditor key={variant.id} variant={variant} onDelete={deleteVariant} onSave={updateVariant} />
                  ))}
                  {selectedVariants.length === 0 ? (
                    <p className="rounded-md border border-dashed border-pine/20 bg-sage/35 p-4 text-sm font-bold text-stone">
                      No options yet. Add seed pack sizes, plant pot sizes, or cutting bundles here.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <button className="button button-primary" disabled={saving} onClick={saveProduct}>{saving ? "Saving..." : "Save Product"}</button>
                <button className="button button-secondary text-rust" onClick={deleteProduct}>Delete Product</button>
                {message ? <p className="font-bold text-stone">{message}</p> : null}
              </div>
            </div>
          ) : (
            <p className="text-lg text-ink/70">Choose a product to edit.</p>
          )}
        </section>
      </div>
      )}
    </main>
  );
}

function AdminOrdersDashboard({ session }: { session: Session | null }) {
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "new" | "pickup" | "shipping" | "fulfilled" | "cancelled" | "all">("open");
  const [orderSearch, setOrderSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [labelPurchasingOrderId, setLabelPurchasingOrderId] = useState<string | null>(null);

  const selected = orders.find((order) => order.id === selectedId) ?? orders[0] ?? null;

  const filteredOrders = useMemo(() => {
    const byStatus = (() => {
      if (filter === "all") return orders;
      if (filter === "open") return orders.filter((order) => !["fulfilled", "cancelled", "refunded"].includes(order.order_status));
      if (filter === "pickup") return orders.filter((order) => order.fulfillment_type === "pickup");
      if (filter === "shipping") return orders.filter((order) => order.fulfillment_type === "shipping");
      return orders.filter((order) => order.order_status === filter);
    })();

    const term = orderSearch.trim().toLowerCase();
    if (!term) return byStatus;
    return byStatus.filter((order) =>
      [
        order.customer_name,
        order.customer_email,
        order.phone,
        order.order_status,
        order.fulfillment_type,
        order.payment_status,
        order.stripe_session_id,
        order.shipping_quote_id,
        order.shipping_method_name,
        order.shipping_provider,
        order.shipping_carrier,
        order.shipping_service,
        order.estimated_delivery,
        order.label_purchase_status,
        ...(order.tracking_numbers ?? []),
        ...(order.label_transaction_ids ?? []),
        ...order.order_items.flatMap((item) => [item.product_name, item.variant_name, item.sku])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [filter, orderSearch, orders]);

  const orderCounts = useMemo(() => ({
    open: orders.filter((order) => !["fulfilled", "cancelled", "refunded"].includes(order.order_status)).length,
    new: orders.filter((order) => order.order_status === "new").length,
    pickup: orders.filter((order) => order.fulfillment_type === "pickup").length,
    shipping: orders.filter((order) => order.fulfillment_type === "shipping").length,
    fulfilled: orders.filter((order) => order.order_status === "fulfilled").length
  }), [orders]);

  useEffect(() => {
    void loadOrders();
  }, []);

  async function loadOrders() {
    if (!supabase) return;
    setLoading(true);
    setMessage("Loading orders...");
    const { data, error } = await supabase
      .from("orders")
      .select(`
        *,
        order_items (
          id,
          order_id,
          product_id,
          variant_id,
          sku,
          product_name,
          variant_name,
          quantity,
          unit_price,
          line_total
        )
      `)
      .order("created_at", { ascending: false });

    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    const rows = ((data ?? []) as ShopOrder[]).map((order) => ({
      ...order,
      order_items: order.order_items ?? []
    }));
    setOrders(rows);
    setSelectedId((current) => current ?? rows[0]?.id ?? null);
    setMessage(`Loaded ${rows.length} order${rows.length === 1 ? "" : "s"}.`);
  }

  async function updateOrderStatus(order: ShopOrder, order_status: ShopOrder["order_status"]) {
    if (!supabase) return;
    setMessage("Updating order...");
    const { error } = await supabase
      .from("orders")
      .update({
        order_status,
        fulfilled_at: order_status === "fulfilled" ? new Date().toISOString() : null
      })
      .eq("id", order.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setOrders((current) =>
      current.map((item) =>
        item.id === order.id
          ? { ...item, order_status, fulfilled_at: order_status === "fulfilled" ? new Date().toISOString() : null }
          : item
      )
    );
    setMessage(`Order marked ${formatStatus(order_status)}.`);
  }

  function exportCsv() {
    const header = ["created_at", "customer", "email", "fulfillment", "shipping_method", "carrier_service", "estimated_delivery", "label_status", "tracking", "quote_id", "status", "payment", "total", "items"];
    const rows = filteredOrders.map((order) => [
      order.created_at,
      order.customer_name ?? "",
      order.customer_email ?? "",
      order.fulfillment_type,
      order.fulfillment_type === "shipping" ? formatOrderShippingMethod(order) : "",
      order.fulfillment_type === "shipping" ? formatShippingCarrierService(order) : "",
      order.estimated_delivery ?? "",
      formatLabelPurchaseStatus(order.label_purchase_status),
      (order.tracking_numbers ?? []).join("; "),
      order.shipping_quote_id ?? "",
      order.order_status,
      order.payment_status,
      order.total,
      order.order_items.map((item) => `${item.quantity}x ${item.product_name}${item.variant_name ? ` (${item.variant_name})` : ""}`).join("; ")
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bcn-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyPickupEmail(order: ShopOrder) {
    const name = order.customer_name?.split(" ")[0] || "there";
    const body = `Hi ${name},\n\nYour Base Camp North order is ready for pickup.\n\nOrder: ${order.order_items
      .map((item) => `${item.quantity}x ${item.product_name}${item.variant_name ? ` (${item.variant_name})` : ""}`)
      .join(", ")}\n\nPickup location: ${order.pickup_location || "Base Camp North"}\n\nThank you!\nBase Camp North`;
    await navigator.clipboard.writeText(body);
    setMessage("Pickup message copied.");
  }

  async function copyShippingAddress(order: ShopOrder) {
    await navigator.clipboard.writeText(formatShippingAddress(order.shipping_address) || "Shipping address not recorded.");
    setMessage("Shipping address copied.");
  }

  async function copyCustomerUpdate(order: ShopOrder) {
    const name = order.customer_name?.split(" ")[0] || "there";
    const itemSummary = order.order_items
      .map((item) => `${item.quantity}x ${item.product_name}${item.variant_name ? ` (${item.variant_name})` : ""}`)
      .join(", ");
    const action =
      order.fulfillment_type === "shipping"
        ? "Your Base Camp North order is packed and moving toward shipping."
        : "Your Base Camp North order is being prepared for local pickup.";
    const shippingDetails = order.fulfillment_type === "shipping"
      ? `\n\nShipping method: ${formatOrderShippingMethod(order)}${order.estimated_delivery ? `\nEstimated delivery: ${order.estimated_delivery}` : ""}${(order.tracking_numbers ?? []).length > 0 ? `\nTracking: ${(order.tracking_numbers ?? []).join(", ")}` : ""}`
      : "";
    const body = `Hi ${name},\n\n${action}\n\nOrder: ${itemSummary}${shippingDetails}\n\nCurrent status: ${formatStatus(order.order_status)}\n\nThank you!\nBase Camp North`;
    await navigator.clipboard.writeText(body);
    setMessage("Customer update copied.");
  }

  async function buyShippingLabel(order: ShopOrder) {
    if (!session?.access_token) {
      setMessage("Sign in again before buying a label.");
      return;
    }

    const eligibility = getLabelPurchaseEligibility(order);
    if (!eligibility.eligible) {
      setMessage(eligibility.reason);
      return;
    }

    setLabelPurchasingOrderId(order.id);
    setMessage("Buying Shippo label...");
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/label`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });
      const payload = await response.json().catch(() => ({}));
      const updatedOrder = payload.order as ShopOrder | undefined;
      if (updatedOrder) {
        setOrders((current) =>
          current.map((item) => item.id === updatedOrder.id ? { ...updatedOrder, order_items: updatedOrder.order_items ?? [] } : item)
        );
      }

      if (!response.ok) {
        setMessage(payload.error || "Shippo label purchase failed.");
        return;
      }

      setMessage("Shippo label purchased.");
    } finally {
      setLabelPurchasingOrderId(null);
    }
  }

  function printPackingSlip(order: ShopOrder) {
    const printWindow = window.open("", "_blank", "width=820,height=900");
    if (!printWindow) {
      setMessage("Popup blocked. Allow popups to print packing slips.");
      return;
    }

    const items = order.order_items
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.product_name)}${item.variant_name ? `<br><span>${escapeHtml(item.variant_name)}</span>` : ""}</td>
            <td>${escapeHtml(item.sku || "")}</td>
            <td>${item.quantity}</td>
            <td>${formatMoney(Number(item.line_total), order.currency)}</td>
          </tr>`
      )
      .join("");
    const fulfillmentDetails = formatPackingSlipFulfillment(order);

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>BCN Packing Slip</title>
          <style>
            body { color: #16201A; font-family: Arial, sans-serif; margin: 32px; }
            h1 { color: #0f3f25; font-size: 32px; margin: 0 0 8px; }
            h2 { font-size: 18px; margin: 28px 0 8px; text-transform: uppercase; letter-spacing: 0.12em; }
            .muted { color: #6d7769; }
            .box { border: 1px solid #ccd8c3; border-radius: 8px; padding: 16px; margin-top: 16px; }
            table { border-collapse: collapse; margin-top: 16px; width: 100%; }
            th, td { border-bottom: 1px solid #ccd8c3; padding: 10px; text-align: left; vertical-align: top; }
            th { font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; }
            span { color: #6d7769; font-size: 12px; }
            .total { font-size: 24px; font-weight: 800; text-align: right; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <button onclick="window.print()">Print</button>
          <h1>Base Camp North</h1>
          <p class="muted">Packing slip / ${escapeHtml(formatDateTime(order.created_at))}</p>
          <div class="box">
            <strong>${escapeHtml(order.customer_name || "Customer")}</strong><br>
            ${escapeHtml(order.customer_email || "No email")}<br>
            ${escapeHtml(order.phone || "")}
          </div>
          <div class="box">
            <strong>${escapeHtml(formatStatus(order.fulfillment_type))}</strong><br>
            <pre>${escapeHtml(fulfillmentDetails)}</pre>
          </div>
          <h2>Items</h2>
          <table>
            <thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th>Total</th></tr></thead>
            <tbody>${items}</tbody>
          </table>
          <p class="total">${formatMoney(Number(order.total), order.currency)}</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setMessage("Packing slip opened.");
  }

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-[420px_1fr]">
      <aside className="field-card p-4">
        <div className="grid grid-cols-2 gap-3">
          <OrderMetric label="open" value={orderCounts.open} />
          <OrderMetric label="new" value={orderCounts.new} />
          <OrderMetric label="pickup" value={orderCounts.pickup} />
          <OrderMetric label="shipping" value={orderCounts.shipping} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(["open", "new", "pickup", "shipping", "fulfilled", "cancelled", "all"] as const).map((nextFilter) => (
            <button
              key={nextFilter}
              className={`rounded-full border px-4 py-2 text-sm font-black ${filter === nextFilter ? "border-pine bg-pine text-white" : "border-pine/20 bg-sage text-pine"}`}
              onClick={() => setFilter(nextFilter)}
            >
              {formatStatus(nextFilter)}
            </button>
          ))}
        </div>

        <input
          className="admin-input mt-4"
          placeholder="Search orders, email, SKU, item..."
          value={orderSearch}
          onChange={(event) => setOrderSearch(event.target.value)}
        />

        <div className="mt-4 flex gap-3">
          <button className="button button-secondary flex-1" onClick={loadOrders}>{loading ? "Loading..." : "Refresh"}</button>
          <button className="button button-secondary flex-1" onClick={exportCsv}>CSV</button>
        </div>

        {message ? <p className="mt-4 text-sm font-bold text-stone">{message}</p> : null}

        <div className="mt-4 max-h-[760px] overflow-y-auto pr-1">
          {filteredOrders.map((order) => (
            <button
              key={order.id}
              className={`mb-2 w-full rounded-md border p-3 text-left ${order.id === selected?.id ? "border-pine bg-sage" : "border-pine/15 bg-white"}`}
              onClick={() => setSelectedId(order.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-pine">{order.customer_name || order.customer_email || "No customer name"}</p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-stone">
                    {formatDateTime(order.created_at)}
                  </p>
                </div>
                <p className="font-black text-pine">{formatMoney(Number(order.total), order.currency)}</p>
              </div>
              <p className="mt-2 text-sm font-bold text-ink/75">
                {formatStatus(order.order_status)} / {order.fulfillment_type} / {order.order_items.length} item{order.order_items.length === 1 ? "" : "s"}
              </p>
              {order.fulfillment_type === "shipping" ? (
                <p className="mt-1 text-xs font-bold text-stone">
                  {formatOrderShippingMethod(order)}{order.estimated_delivery ? ` / ${order.estimated_delivery}` : ""}
                </p>
              ) : null}
              {order.fulfillment_type === "shipping" ? (
                <p className="mt-1 text-xs font-bold text-stone">
                  Label: {formatLabelPurchaseStatus(order.label_purchase_status)}
                  {(order.tracking_numbers ?? []).length > 0 ? ` / ${(order.tracking_numbers ?? []).join(", ")}` : ""}
                </p>
              ) : null}
            </button>
          ))}
        </div>
      </aside>

      <section className="field-card p-6">
        {selected ? (
          <OrderDetail
            order={selected}
            onStatus={updateOrderStatus}
            onCopyPickupEmail={copyPickupEmail}
            onCopyShippingAddress={copyShippingAddress}
            onCopyCustomerUpdate={copyCustomerUpdate}
            onBuyShippingLabel={buyShippingLabel}
            labelPurchasing={labelPurchasingOrderId === selected.id}
            onPrintPackingSlip={printPackingSlip}
          />
        ) : (
          <p className="text-lg text-ink/70">No orders yet.</p>
        )}
      </section>
    </div>
  );
}

function OrderDetail({
  order,
  onStatus,
  onCopyPickupEmail,
  onCopyShippingAddress,
  onCopyCustomerUpdate,
  onBuyShippingLabel,
  labelPurchasing,
  onPrintPackingSlip
}: {
  order: ShopOrder;
  onStatus: (order: ShopOrder, status: ShopOrder["order_status"]) => void;
  onCopyPickupEmail: (order: ShopOrder) => void;
  onCopyShippingAddress: (order: ShopOrder) => void;
  onCopyCustomerUpdate: (order: ShopOrder) => void;
  onBuyShippingLabel: (order: ShopOrder) => void;
  labelPurchasing: boolean;
  onPrintPackingSlip: (order: ShopOrder) => void;
}) {
  const shippingAddress = formatShippingAddress(order.shipping_address);
  const shippingMethod = formatOrderShippingMethod(order);
  const carrierService = formatShippingCarrierService(order);
  const provider = formatShippingProvider(order.shipping_provider);
  const validationStatus = formatAddressValidationStatus(order.address_validation_status);
  const labelEligibility = getLabelPurchaseEligibility(order);
  const labelStatus = formatLabelPurchaseStatus(order.label_purchase_status);
  const hasLabels = hasPurchasedShippingLabels(order);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-stone">Order detail</p>
          <h2 className="mt-2 text-3xl font-black text-pine">{order.customer_name || "Customer"}</h2>
          <p className="mt-2 text-ink/70">{order.customer_email || "No email"} {order.phone ? `/ ${order.phone}` : ""}</p>
          <p className="mt-1 text-sm font-bold text-stone">{formatDateTime(order.created_at)}</p>
        </div>
        <div className="rounded-md bg-pine px-5 py-4 text-right text-white">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-white/70">Total</p>
          <p className="text-3xl font-black">{formatMoney(Number(order.total), order.currency)}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <OrderMetric label="status" value={formatStatus(order.order_status)} />
        <OrderMetric label="payment" value={formatStatus(order.payment_status)} />
        <OrderMetric label="fulfillment" value={order.fulfillment_type} />
        <OrderMetric label="items" value={order.order_items.reduce((sum, item) => sum + Number(item.quantity), 0)} />
      </div>

      <div>
        <h3 className="text-xl font-black text-pine">Items</h3>
        <div className="mt-3 overflow-hidden rounded-md border border-pine/15">
          {order.order_items.map((item) => (
            <div key={item.id} className="grid gap-2 border-b border-pine/10 bg-white p-4 last:border-b-0 md:grid-cols-[1fr_90px_100px]">
              <div>
                <p className="font-black text-pine">{item.product_name}</p>
                <p className="text-sm font-bold text-stone">{item.variant_name || "Regular"} {item.sku ? `/ ${item.sku}` : ""}</p>
              </div>
              <p className="font-black text-pine">Qty {item.quantity}</p>
              <p className="font-black text-pine">{formatMoney(Number(item.line_total), order.currency)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-md border border-pine/15 bg-sage/45 p-4">
          <h3 className="text-lg font-black text-pine">Fulfillment</h3>
          {order.fulfillment_type === "pickup" ? (
            <p className="mt-2 text-ink/75">Pickup: {order.pickup_location || "Base Camp North"}</p>
          ) : (
            <div className="mt-2 grid gap-2 text-sm font-bold text-ink/75">
              {shippingAddress ? <p className="whitespace-pre-line">{shippingAddress}</p> : <p>Shipping address not recorded.</p>}
              <p>Method: {shippingMethod}</p>
              {carrierService && carrierService !== shippingMethod ? <p>Service: {carrierService}</p> : null}
              {provider ? <p>Provider: {provider}</p> : null}
              {order.estimated_delivery ? <p>Estimated delivery: {order.estimated_delivery}</p> : null}
              {validationStatus ? <p>Address validation: {validationStatus}</p> : null}
              {order.untracked_shipping_acknowledged ? <p>Economy Seed Mail no-tracking acknowledged.</p> : null}
              <p>Label: {labelStatus}</p>
              {order.label_purchase_error ? <p className="text-rust">Label error: {order.label_purchase_error}</p> : null}
              {(order.tracking_numbers ?? []).length > 0 ? <p>Tracking: {(order.tracking_numbers ?? []).join(", ")}</p> : null}
              {(order.label_urls ?? []).length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {(order.label_urls ?? []).map((url, index) => (
                    <a key={url} className="button button-secondary" href={url} target="_blank" rel="noreferrer">
                      Open Label {index + 1}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          )}
          {order.notes ? <p className="mt-3 text-sm font-bold text-stone">Notes: {order.notes}</p> : null}
        </section>
        <section className="rounded-md border border-pine/15 bg-sage/45 p-4">
          <h3 className="text-lg font-black text-pine">Stripe</h3>
          <p className="mt-2 break-all text-sm text-ink/75">Session: {order.stripe_session_id}</p>
          <p className="mt-2 break-all text-sm text-ink/75">Payment: {order.stripe_payment_intent || "not recorded"}</p>
          {order.shipping_quote_id ? <p className="mt-2 break-all text-sm text-ink/75">Quote: {order.shipping_quote_id}</p> : null}
          {(order.label_transaction_ids ?? []).length > 0 ? (
            <p className="mt-2 break-all text-sm text-ink/75">Label transaction: {(order.label_transaction_ids ?? []).join(", ")}</p>
          ) : null}
        </section>
      </div>

      <div className="flex flex-wrap gap-3">
        <button className="button button-primary" onClick={() => onStatus(order, "ready_for_pickup")}>Ready for Pickup</button>
        <button className="button button-secondary" onClick={() => onStatus(order, "shipped")}>Mark Shipped</button>
        <button className="button button-secondary" onClick={() => onStatus(order, "fulfilled")}>Mark Fulfilled</button>
        <button className="button button-secondary" onClick={() => onCopyPickupEmail(order)}>Copy Pickup Email</button>
        <button className="button button-secondary" onClick={() => onCopyCustomerUpdate(order)}>Copy Customer Update</button>
        {order.fulfillment_type === "shipping" ? (
          <button className="button button-secondary" onClick={() => onCopyShippingAddress(order)}>Copy Address</button>
        ) : null}
        {order.fulfillment_type === "shipping" && !hasLabels ? (
          <button
            className="button button-primary"
            disabled={!labelEligibility.eligible || labelPurchasing}
            onClick={() => onBuyShippingLabel(order)}
            title={labelEligibility.reason || "Buy Shippo label"}
          >
            {labelPurchasing ? "Buying Label..." : "Buy Label"}
          </button>
        ) : null}
        <button className="button button-secondary" onClick={() => onPrintPackingSlip(order)}>Print Packing Slip</button>
        <button className="button button-secondary text-rust" onClick={() => onStatus(order, "cancelled")}>Mark Issue/Cancelled</button>
      </div>
      {order.fulfillment_type === "shipping" && !hasLabels && !labelEligibility.eligible ? (
        <p className="text-sm font-bold text-stone">{labelEligibility.reason}</p>
      ) : null}
    </div>
  );
}

function CatalogMetric({
  label,
  value,
  tone = "normal"
}: {
  label: string;
  value: string | number;
  tone?: "normal" | "attention";
}) {
  return (
    <div className={`rounded-md border p-3 ${tone === "attention" ? "border-rust/30 bg-rust/10" : "border-pine/15 bg-sage/60"}`}>
      <p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-stone">{label}</p>
      <p className="mt-2 text-2xl font-black text-pine">{value}</p>
    </div>
  );
}

function AttentionBadge({
  children,
  tone = "stone"
}: {
  children: ReactNode;
  tone?: "rust" | "stone";
}) {
  return (
    <span className={`rounded-full px-2 py-1 text-[0.65rem] font-black uppercase tracking-[0.08em] ${tone === "rust" ? "bg-rust/15 text-rust" : "bg-sage text-stone"}`}>
      {children}
    </span>
  );
}

function OrderMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-pine/15 bg-sage/60 p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-stone">{label}</p>
      <p className="mt-2 text-xl font-black text-pine">{value}</p>
    </div>
  );
}

function AdminShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="container py-12">
      <section className="field-card mx-auto max-w-2xl p-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-stone">Owner admin</p>
        <h1 className="mt-3 text-4xl font-black text-pine">{title}</h1>
        <div className="mt-2 text-ink/75">{children}</div>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-stone">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function ShippingProductSection({
  form,
  packagePresets,
  validation,
  setForm
}: {
  form: CatalogForm;
  packagePresets: ShippingPackagePreset[];
  validation: ReturnType<typeof validateProductShipping>;
  setForm: Dispatch<SetStateAction<CatalogForm>>;
}) {
  const selectedClass = form.shipping_class;
  const showPackageFields = requiresPackageData(selectedClass);
  const showGroundAdvantage = canUseGroundAdvantage(selectedClass);
  const selectablePresets = packagePresets.filter((preset) => {
    if (!preset.active && preset.id !== form.preferred_package_id) return false;
    if (!selectedClass) return true;
    return preset.allowed_shipping_classes.includes(selectedClass);
  });

  function updateShippingClass(nextClass: ShippingClass | "") {
    setForm((current) => applyShippingClassDefaults(current, nextClass));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-black text-pine">Shipping</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${validation.complete ? "bg-pine text-white" : "bg-rust/10 text-rust"}`}>
          {validation.complete ? "Setup complete" : "Needs setup"}
        </span>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Shipping class">
          <select className="admin-input" value={selectedClass} onChange={(event) => updateShippingClass(event.target.value as ShippingClass | "")}>
            <option value="">Choose a class</option>
            {SHIPPING_CLASSES.map((shippingClass) => (
              <option key={shippingClass} value={shippingClass}>{SHIPPING_CLASS_LABELS[shippingClass]}</option>
            ))}
          </select>
        </Field>

        <div className="rounded-md border border-pine/15 bg-sage/45 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-stone">Fulfillment</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Toggle
              label="Shipping enabled"
              checked={form.shipping_enabled}
              disabled={selectedClass === "digital" || selectedClass === "oversized_pickup_only"}
              onChange={(checked) => setForm((current) => ({ ...current, shipping_enabled: checked, ships: checked }))}
            />
            <Toggle
              label="Local pickup"
              checked={form.local_pickup_enabled}
              disabled={selectedClass === "digital"}
              onChange={(checked) => setForm((current) => ({ ...current, local_pickup_enabled: checked, local_pickup: checked }))}
            />
          </div>
        </div>
      </div>

      {selectedClass ? (
        <p className="mt-3 rounded-md bg-sage/45 p-3 text-sm font-bold text-stone">
          {SHIPPING_CLASS_DESCRIPTIONS[selectedClass]}
        </p>
      ) : null}

      {showPackageFields ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Packed weight (oz)">
            <input className="admin-input" type="number" min="0" step="0.1" value={form.packed_weight_oz} onChange={(event) => setForm({ ...form, packed_weight_oz: event.target.value })} />
          </Field>

          <Field label="Preferred package preset">
            <select className="admin-input" value={form.preferred_package_id} onChange={(event) => setForm({ ...form, preferred_package_id: event.target.value })}>
              <option value="">Use custom dimensions</option>
              {selectablePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name} ({preset.length_in} x {preset.width_in} x {preset.height_in} in)
                </option>
              ))}
            </select>
          </Field>

          {!form.preferred_package_id ? (
            <>
              <Field label="Packed length (in)">
                <input className="admin-input" type="number" min="0" step="0.1" value={form.packed_length_in} onChange={(event) => setForm({ ...form, packed_length_in: event.target.value })} />
              </Field>
              <Field label="Packed width (in)">
                <input className="admin-input" type="number" min="0" step="0.1" value={form.packed_width_in} onChange={(event) => setForm({ ...form, packed_width_in: event.target.value })} />
              </Field>
              <Field label="Packed height (in)">
                <input className="admin-input" type="number" min="0" step="0.1" value={form.packed_height_in} onChange={(event) => setForm({ ...form, packed_height_in: event.target.value })} />
              </Field>
            </>
          ) : null}

          <Field label="Maximum quantity per package">
            <input className="admin-input" type="number" min="1" step="1" value={form.max_quantity_per_package} onChange={(event) => setForm({ ...form, max_quantity_per_package: event.target.value })} />
          </Field>

          <Field label="Shipping surcharge ($)">
            <input className="admin-input" type="number" min="0" step="0.01" value={form.shipping_surcharge} onChange={(event) => setForm({ ...form, shipping_surcharge: event.target.value })} />
          </Field>
        </div>
      ) : null}

      {selectedClass && selectedClass !== "digital" && selectedClass !== "oversized_pickup_only" ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <Toggle label="Ships alone" checked={form.ships_alone} onChange={(checked) => setForm({ ...form, ships_alone: checked })} />
          <Toggle
            label="Expedited required"
            checked={selectedClass === "tree" ? true : form.expedited_required}
            disabled={selectedClass === "tree"}
            onChange={(checked) => setForm({ ...form, expedited_required: checked })}
          />
          <Toggle
            label="Allow Ground Advantage"
            checked={showGroundAdvantage ? form.allow_ground_advantage : false}
            disabled={!showGroundAdvantage}
            onChange={(checked) => setForm({ ...form, allow_ground_advantage: checked })}
          />
          <Toggle label="Free-shipping eligible" checked={form.free_shipping_eligible} onChange={(checked) => setForm({ ...form, free_shipping_eligible: checked })} />
        </div>
      ) : null}

      <div className="mt-4">
        <Field label="Shipping Notes">
          <textarea className="admin-input min-h-28" value={form.shipping_notes} onChange={(event) => setForm({ ...form, shipping_notes: event.target.value })} />
        </Field>
      </div>

      {validation.errors.length > 0 ? (
        <div className="mt-4 rounded-md bg-rust/10 p-4 text-sm font-bold text-rust">
          {validation.errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}

      {validation.warnings.length > 0 ? (
        <div className="mt-4 rounded-md bg-sage p-4 text-sm font-bold text-stone">
          {validation.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GrowingSelectField({
  config,
  value,
  visible,
  onValueChange,
  onVisibleChange
}: {
  config: GrowingSelectConfig;
  value: string;
  visible: boolean;
  onValueChange: (value: string) => void;
  onVisibleChange: (visible: boolean) => void;
}) {
  const isCustom = value === CUSTOM_GROWING_VALUE || (value.trim() !== "" && !config.options.includes(value));
  const selectValue = isCustom ? CUSTOM_GROWING_VALUE : value;
  const customValue = value === CUSTOM_GROWING_VALUE ? "" : value;

  return (
    <article className="rounded-md border border-pine/15 bg-sage/45 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-black uppercase tracking-[0.16em] text-stone">{config.label}</span>
        <Toggle label="Show on product page" checked={visible} onChange={onVisibleChange} />
      </div>
      <select
        className="admin-input mt-3"
        value={selectValue}
        onChange={(event) => onValueChange(event.target.value === CUSTOM_GROWING_VALUE ? CUSTOM_GROWING_VALUE : event.target.value)}
      >
        <option value="">Not selected</option>
        {config.options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
        <option value={CUSTOM_GROWING_VALUE}>Other / Custom</option>
      </select>
      {isCustom ? (
        <input
          className="admin-input mt-3"
          value={customValue}
          placeholder={config.customPlaceholder ?? "Custom value"}
          onChange={(event) => onValueChange(event.target.value)}
        />
      ) : null}
    </article>
  );
}

function Toggle({
  label,
  checked,
  disabled = false,
  onChange
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`rounded-full border px-4 py-2 text-sm font-black ${disabled ? "cursor-not-allowed opacity-55" : ""} ${checked ? "border-pine bg-pine text-white" : "border-pine/20 bg-sage text-pine"}`}>
      <input className="sr-only" type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function applyShippingClassDefaults(current: CatalogForm, shippingClass: ShippingClass | ""): CatalogForm {
  const base: CatalogForm = {
    ...current,
    shipping_class: shippingClass,
    preferred_package_id: "",
    shipping_configuration_complete: false
  };

  if (shippingClass === "digital") {
    return {
      ...base,
      shipping_enabled: false,
      local_pickup_enabled: false,
      ships: false,
      local_pickup: false,
      packed_weight_oz: "",
      packed_length_in: "",
      packed_width_in: "",
      packed_height_in: "",
      ships_alone: false,
      expedited_required: false,
      allow_ground_advantage: false,
      free_shipping_eligible: false,
      max_quantity_per_package: "1"
    };
  }

  if (shippingClass === "oversized_pickup_only") {
    return {
      ...base,
      shipping_enabled: false,
      local_pickup_enabled: true,
      ships: false,
      local_pickup: true,
      packed_weight_oz: "",
      packed_length_in: "",
      packed_width_in: "",
      packed_height_in: "",
      ships_alone: false,
      expedited_required: false,
      allow_ground_advantage: false,
      free_shipping_eligible: false,
      max_quantity_per_package: "1"
    };
  }

  if (shippingClass === "tree") {
    return {
      ...base,
      expedited_required: true,
      allow_ground_advantage: false,
      max_quantity_per_package: "1"
    };
  }

  return {
    ...base,
    allow_ground_advantage: canUseGroundAdvantage(shippingClass) ? current.allow_ground_advantage : false
  };
}

function validateProductShipping(form: CatalogForm) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const shippingClass = form.shipping_class;
  const weight = Number(form.packed_weight_oz);
  const length = Number(form.packed_length_in);
  const width = Number(form.packed_width_in);
  const height = Number(form.packed_height_in);
  const maxQuantity = Number(form.max_quantity_per_package);
  const surcharge = Number(form.shipping_surcharge);
  const hasDimensions = length > 0 && width > 0 && height > 0;
  const hasPartialDimensions = [form.packed_length_in, form.packed_width_in, form.packed_height_in].some((value) => value.trim() !== "") && !hasDimensions;
  const hasPackagePreset = Boolean(form.preferred_package_id);

  if (!shippingClass) {
    warnings.push("Choose a shipping class before Phase 2 uses this product for shipping rules.");
  }

  if (shippingClass === "digital" && form.shipping_enabled) {
    errors.push("Digital products cannot have shipping enabled.");
  }

  if (shippingClass === "oversized_pickup_only" && form.shipping_enabled) {
    errors.push("Pickup-only products cannot have shipping enabled.");
  }

  if (shippingClass !== "digital" && !form.shipping_enabled && !form.local_pickup_enabled) {
    warnings.push("This product has no fulfillment method selected yet.");
  }

  if (form.shipping_enabled && requiresPackageData(shippingClass)) {
    if (form.packed_weight_oz.trim() === "" || !Number.isFinite(weight) || weight <= 0) {
      warnings.push("Add a packed weight before Phase 2 quotes this shipped physical item.");
    }
    if (!hasPackagePreset && !hasDimensions) {
      warnings.push("Choose a package preset or add packed dimensions before Phase 2 quotes this item.");
    }
  }

  if (hasPartialDimensions) {
    errors.push("Custom package dimensions must include length, width, and height greater than zero.");
  }

  if (!Number.isFinite(maxQuantity) || maxQuantity <= 0) {
    errors.push("Maximum quantity per package must be at least 1.");
  }

  if (!Number.isFinite(surcharge) || surcharge < 0) {
    errors.push("Shipping surcharge cannot be negative.");
  }

  return {
    complete: errors.length === 0 && warnings.length === 0,
    errors,
    warnings
  };
}

function numberToFormValue(value: number | null | undefined) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function centsToFormDollars(value: number | null | undefined) {
  return ((Number(value) || 0) / 100).toFixed(2);
}

function formNumberToDb(value: string) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function dollarsToCents(value: string) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return 0;
  return Math.round(numberValue * 100);
}

function shouldClearPackageDimensions(form: CatalogForm) {
  return form.shipping_class === "digital" || form.shipping_class === "oversized_pickup_only" || Boolean(form.preferred_package_id);
}

const EDITABLE_PLACEHOLDER_VALUES = new Set([
  "See product description",
  "See product description for bloom and pollinator notes.",
  "Selected for nursery, wildlife, food forest, or restoration value.",
  "Shipping and pickup availability depends on item size, season, and live-plant condition."
]);

function cleanEditableText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || EDITABLE_PLACEHOLDER_VALUES.has(trimmed)) return "";
  return trimmed;
}

function editableTextToDb(value: string) {
  const cleaned = cleanEditableText(value === CUSTOM_GROWING_VALUE ? "" : value);
  return cleaned || null;
}

function formatMoney(value: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase()
  }).format(Number(value) || 0);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatPackingSlipFulfillment(order: ShopOrder) {
  if (order.fulfillment_type === "pickup") {
    return order.pickup_location || "Base Camp North local pickup";
  }

  const method = formatOrderShippingMethod(order);
  const carrierService = formatShippingCarrierService(order);
  const provider = formatShippingProvider(order.shipping_provider);
  const lines = [
    formatShippingAddress(order.shipping_address) || "Shipping address not recorded.",
    `Method: ${method}`,
    carrierService && carrierService !== method ? `Service: ${carrierService}` : "",
    provider ? `Provider: ${provider}` : "",
    order.estimated_delivery ? `Estimated delivery: ${order.estimated_delivery}` : "",
    `Label: ${formatLabelPurchaseStatus(order.label_purchase_status)}`,
    (order.tracking_numbers ?? []).length > 0 ? `Tracking: ${(order.tracking_numbers ?? []).join(", ")}` : "",
    order.shipping_quote_id ? `Quote: ${order.shipping_quote_id}` : "",
    order.untracked_shipping_acknowledged ? "Economy Seed Mail no-tracking acknowledged." : ""
  ];

  return lines.filter(Boolean).join("\n");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function VariantEditor({
  variant,
  onDelete,
  onSave
}: {
  variant: CatalogVariant;
  onDelete: (variant: CatalogVariant) => void;
  onSave: (variant: CatalogVariant, patch: Partial<CatalogVariant>) => void;
}) {
  const [draft, setDraft] = useState(variant);

  useEffect(() => setDraft(variant), [variant]);

  return (
    <article className="rounded-md border border-pine/15 bg-sage/45 p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_120px_100px_100px_auto]">
        <input className="admin-input" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        <input className="admin-input" value={draft.sku ?? ""} placeholder="SKU" onChange={(event) => setDraft({ ...draft, sku: event.target.value })} />
        <input className="admin-input" type="number" step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} />
        <input className="admin-input" type="number" value={draft.inventory} onChange={(event) => setDraft({ ...draft, inventory: Number(event.target.value) })} />
        <button className="button button-secondary" onClick={() => onSave(variant, draft)}>Save</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className={`rounded-full px-3 py-1 text-xs font-black ${draft.active ? "bg-pine text-white" : "bg-white text-stone"}`}
          onClick={() => {
            const active = !draft.active;
            setDraft({ ...draft, active });
            onSave(variant, { active });
          }}
        >
          {draft.active ? "Active" : "Hidden"}
        </button>
        {[-5, -1, 1, 5, 10].map((amount) => (
          <button
            key={amount}
            className="rounded-full bg-white px-3 py-1 text-xs font-black text-pine"
            onClick={() => {
              const inventory = Math.max(0, Number(draft.inventory) + amount);
              setDraft({ ...draft, inventory });
              onSave(variant, { inventory });
            }}
          >
            {amount > 0 ? `+${amount}` : amount}
          </button>
        ))}
        <button
          className="rounded-full bg-white px-3 py-1 text-xs font-black text-rust"
          onClick={() => {
            setDraft({ ...draft, inventory: 0 });
            onSave(variant, { inventory: 0 });
          }}
        >
          Sold out
        </button>
        <button className="rounded-full bg-white px-3 py-1 text-xs font-black text-rust" onClick={() => onDelete(variant)}>
          Delete option
        </button>
      </div>
    </article>
  );
}

function makeId(prefix: string) {
  const randomId =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${randomId}`;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function safeFileName(value: string) {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return cleaned || "product-photo.jpg";
}
