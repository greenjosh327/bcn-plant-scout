import type { ShippingAddress } from "./types";

export type ShippingAddressInput = Partial<ShippingAddress> & {
  line1?: string;
  line2?: string;
  postalCode?: string;
  postal_code?: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeShippingAddress(input: ShippingAddressInput | null | undefined): ShippingAddress {
  const country = clean(input?.country) || "US";

  return {
    name: clean(input?.name) || undefined,
    organization: clean(input?.organization) || undefined,
    street1: clean(input?.street1 ?? input?.line1),
    street2: clean(input?.street2 ?? input?.line2) || undefined,
    city: clean(input?.city),
    state: clean(input?.state).toUpperCase(),
    zip: clean(input?.zip ?? input?.postalCode ?? input?.postal_code),
    country: country.toUpperCase(),
    phone: clean(input?.phone) || undefined,
    email: clean(input?.email) || undefined
  };
}

export function isCompleteShippingAddress(address: ShippingAddress) {
  return Boolean(address.street1 && address.city && address.state && address.zip && address.country);
}

export function shippingAddressEquals(left: ShippingAddressInput | null | undefined, right: ShippingAddressInput | null | undefined) {
  return JSON.stringify(normalizeShippingAddress(left)) === JSON.stringify(normalizeShippingAddress(right));
}
