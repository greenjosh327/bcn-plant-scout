export type ShippingDisplayOrder = {
  fulfillment_type?: "pickup" | "shipping" | string | null;
  pickup_location?: string | null;
  shipping_method_name?: string | null;
  shipping_carrier?: string | null;
  shipping_service?: string | null;
  shipping_provider?: string | null;
};

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatShippingCarrierService(order: ShippingDisplayOrder) {
  const carrier = cleanText(order.shipping_carrier);
  const service = cleanText(order.shipping_service);
  if (carrier && service && service.toLowerCase().includes(carrier.toLowerCase())) return service;
  return [carrier, service].filter(Boolean).join(" - ");
}

export function formatOrderShippingMethod(order: ShippingDisplayOrder) {
  if (order.fulfillment_type === "pickup") {
    return cleanText(order.pickup_location) || "Base Camp North local pickup";
  }

  return cleanText(order.shipping_method_name) || formatShippingCarrierService(order) || "Shipping";
}

export function formatShippingProvider(provider: string | null | undefined) {
  const value = cleanText(provider);
  if (!value) return "";
  if (value === "shippo") return "Shippo";
  if (value === "flat_rate") return "Flat Rate";
  if (value === "manual_usps_letter") return "Manual USPS Letter";
  if (value === "local_pickup") return "Local Pickup";
  if (value === "digital_delivery") return "Digital Delivery";
  return titleCase(value);
}

export function formatAddressValidationStatus(value: string | null | undefined) {
  const status = cleanText(value);
  return status ? titleCase(status) : "";
}

export function formatShippingAddress(address: Record<string, unknown> | null | undefined) {
  if (!address || Object.keys(address).length === 0) return "";

  const city = cleanText(address.city);
  const state = cleanText(address.state);
  const postalCode = cleanText(address.postal_code) || cleanText(address.zip);
  const regionLine = [city, [state, postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  const parts = [
    address.name,
    address.line1 ?? address.street1,
    address.line2 ?? address.street2,
    regionLine,
    address.country
  ]
    .map(cleanText)
    .filter(Boolean);

  return parts.length ? parts.join("\n") : JSON.stringify(address);
}
