import { getSupabaseServiceClient } from "../supabase-service";
import { DEFAULT_PACKAGE_PRESETS, DEFAULT_SHIPPING_SETTINGS, normalizeShippingSettings } from "./config";
import type { ShippingPackagePreset, ShippingSettings } from "./types";

function normalizePreset(row: Record<string, unknown>): ShippingPackagePreset {
  return {
    id: String(row.id),
    name: String(row.name),
    code: String(row.code),
    length_in: Number(row.length_in),
    width_in: Number(row.width_in),
    height_in: Number(row.height_in),
    empty_weight_oz: Number(row.empty_weight_oz) || 0,
    maximum_weight_oz: Number(row.maximum_weight_oz),
    allowed_shipping_classes: Array.isArray(row.allowed_shipping_classes) ? row.allowed_shipping_classes as ShippingPackagePreset["allowed_shipping_classes"] : [],
    active: row.active !== false,
    sort_order: Number(row.sort_order) || 0,
    created_at: typeof row.created_at === "string" ? row.created_at : undefined,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined
  };
}

export async function getShippingRuntimeConfig(): Promise<{
  packagePresets: ShippingPackagePreset[];
  settings: ShippingSettings;
}> {
  let supabase: ReturnType<typeof getSupabaseServiceClient>;
  try {
    supabase = getSupabaseServiceClient();
  } catch {
    return {
      packagePresets: DEFAULT_PACKAGE_PRESETS,
      settings: DEFAULT_SHIPPING_SETTINGS
    };
  }

  const [{ data: presetRows, error: presetError }, { data: settingsRow, error: settingsError }] = await Promise.all([
    supabase.from("shipping_package_presets").select("*").eq("active", true).order("sort_order", { ascending: true }),
    supabase.from("shipping_settings").select("*").eq("id", "default").maybeSingle()
  ]);

  if (presetError) {
    throw new Error(`Could not load shipping package presets: ${presetError.message}`);
  }

  if (settingsError) {
    throw new Error(`Could not load shipping settings: ${settingsError.message}`);
  }

  return {
    packagePresets: (presetRows ?? []).map((row) => normalizePreset(row as Record<string, unknown>)),
    settings: settingsRow ? normalizeShippingSettings(settingsRow as Record<string, unknown>) : DEFAULT_SHIPPING_SETTINGS
  };
}
