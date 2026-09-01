import type { SupabaseServiceClient } from "@/lib/admin-api";
import {
  ETSY_API_BASE_URL,
  etsyApiKeyHeader,
  etsyInventoryWritesEnabled
} from "./config";
import {
  forceRefreshAuthorizedEtsyAccess,
  getAuthorizedEtsyAccess,
  readEtsyErrorMessage
} from "./client";
import type { EtsyListingInventory } from "./types";

export type EtsyInventoryUpdatePayload = {
  products: Array<{
    sku?: string | null;
    property_values?: Array<{
      property_id: number;
      value_ids: number[];
      values: string[];
      scale_id?: number | null;
      property_name?: string;
    }>;
    offerings: Array<{
      price: number;
      quantity: number;
      is_enabled: boolean;
      readiness_state_id: number | null;
    }>;
  }>;
  price_on_property: number[];
  quantity_on_property: number[];
  sku_on_property: number[];
  readiness_state_on_property: number[];
};

export class EtsyInventoryWriteError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly status: number,
    public readonly safeMessage: string
  ) {
    super(`Etsy inventory update failed with status ${status}.`);
  }
}

export function assertEtsyInventoryWriteRequest(method: string, path: string, enabled = etsyInventoryWritesEnabled()) {
  if (!enabled) throw new Error("Etsy inventory writes are disabled pending owner review of the first proposal.");
  if (method.toUpperCase() !== "PUT" || !/^\/listings\/[1-9]\d*\/inventory$/.test(path)) {
    throw new Error("Only Etsy listing inventory quantity updates are allowed in Phase 2.");
  }
}

export function inventoryOfferingKey(productId: number, offeringId: number) {
  return `${productId}:${offeringId}`;
}

export function buildEtsyInventoryUpdatePayload(
  inventory: EtsyListingInventory,
  approvedQuantities: ReadonlyMap<string, number>
): EtsyInventoryUpdatePayload {
  const products = (inventory.products || [])
    .filter((product) => !product.is_deleted)
    .map((product) => {
      const productId = Number(product.product_id);
      const offerings = (product.offerings || [])
        .filter((offering) => !offering.is_deleted)
        .map((offering) => {
          const divisor = Number(offering.price?.divisor);
          if (!Number.isFinite(divisor) || divisor <= 0) throw new Error("Etsy returned an invalid offering price.");

          const offeringId = Number(offering.offering_id);
          const approvedQuantity = approvedQuantities.get(inventoryOfferingKey(productId, offeringId));
          const quantity = approvedQuantity === undefined ? Number(offering.quantity) : approvedQuantity;
          if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error("An approved Etsy quantity was invalid.");

          return {
            price: Number(offering.price.amount) / divisor,
            quantity,
            is_enabled: Boolean(offering.is_enabled),
            readiness_state_id:
              offering.readiness_state_id !== null &&
              offering.readiness_state_id !== undefined &&
              Number.isSafeInteger(Number(offering.readiness_state_id)) &&
              Number(offering.readiness_state_id) > 0
                ? Number(offering.readiness_state_id)
                : null
          };
        });

      if (offerings.length === 0) throw new Error("Etsy returned a product without an active offering.");

      const propertyValues = (product.property_values || []).map((property) => ({
        property_id: Number(property.property_id),
        value_ids: (property.value_ids || []).map(Number),
        values: (property.values || []).map(String),
        ...(property.scale_id === undefined ? {} : { scale_id: property.scale_id === null ? null : Number(property.scale_id) }),
        ...(property.property_name ? { property_name: property.property_name } : {})
      }));

      return {
        sku: product.sku ?? null,
        property_values: propertyValues,
        offerings
      };
    });

  if (products.length === 0) throw new Error("Etsy returned no active inventory products to update.");

  return {
    products,
    price_on_property: (inventory.price_on_property || []).map(Number),
    quantity_on_property: (inventory.quantity_on_property || []).map(Number),
    sku_on_property: (inventory.sku_on_property || []).map(Number),
    readiness_state_on_property: (inventory.readiness_state_on_property || []).map(Number)
  };
}

async function sendInventoryUpdate(
  listingId: number,
  payload: EtsyInventoryUpdatePayload,
  authorization: Awaited<ReturnType<typeof getAuthorizedEtsyAccess>>,
  fetchImplementation: typeof fetch
) {
  const path = `/listings/${listingId}/inventory`;
  assertEtsyInventoryWriteRequest("PUT", path);
  const response = await fetchImplementation(`${ETSY_API_BASE_URL}${path}`, {
    method: "PUT",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${authorization.accessToken}`,
      "content-type": "application/json",
      "x-api-key": etsyApiKeyHeader(authorization.config)
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  if (response.ok) return (await response.json()) as EtsyListingInventory;

  const safeMessage = await readEtsyErrorMessage(response, [
    authorization.accessToken,
    authorization.config.apiKey,
    authorization.config.sharedSecret,
    etsyApiKeyHeader(authorization.config)
  ]);
  console.error("Etsy inventory update failed", { endpoint: path, status: response.status, message: safeMessage });
  throw new EtsyInventoryWriteError(path, response.status, safeMessage);
}

export async function updateEtsyListingInventory(
  supabase: SupabaseServiceClient,
  listingId: number,
  payload: EtsyInventoryUpdatePayload,
  fetchImplementation: typeof fetch = fetch
) {
  if (!Number.isSafeInteger(listingId) || listingId <= 0) throw new Error("A valid Etsy listing ID is required.");
  let authorization = await getAuthorizedEtsyAccess(supabase, fetchImplementation);

  try {
    return await sendInventoryUpdate(listingId, payload, authorization, fetchImplementation);
  } catch (error) {
    if (!(error instanceof EtsyInventoryWriteError) || error.status !== 401) throw error;
    authorization = await forceRefreshAuthorizedEtsyAccess(supabase, fetchImplementation);
    return sendInventoryUpdate(listingId, payload, authorization, fetchImplementation);
  }
}
