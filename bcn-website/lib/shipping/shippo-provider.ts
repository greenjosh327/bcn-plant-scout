import { normalizeShippingAddress, isCompleteShippingAddress } from "./address";
import type {
  AddressValidationStatus,
  BuiltShippingPackage,
  ShippingAddress,
  ShippingMethodCode,
  ShippingSettings
} from "./types";

const SHIPPO_API_BASE = "https://api.goshippo.com/";
const DEFAULT_SHIPPO_API_VERSION = "2018-02-08";

export type LiveShippingRate = {
  packageKey: string;
  shipmentId: string;
  rateId: string;
  methodCode: ShippingMethodCode;
  amountCents: number;
  currency: "usd";
  carrier: string;
  serviceName: string;
  serviceToken: string;
  estimatedDays: number | null;
  durationTerms?: string;
};

export type ShippoQuoteResult = {
  providerAvailable: boolean;
  validationStatus: AddressValidationStatus;
  validatedAddress: ShippingAddress | Record<string, unknown>;
  packageRates: Array<{
    packageKey: string;
    shipmentId: string;
    rates: LiveShippingRate[];
  }>;
  messages: string[];
};

export function getShippoToken() {
  return process.env.SHIPPO_API_TOKEN || process.env.SHIPPO_TOKEN || process.env.SHIPPO_API_KEY || "";
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function env(name: string) {
  return clean(process.env[name]);
}

function getEnvShipFromAddress() {
  const address = normalizeShippingAddress({
    name: env("SHIP_FROM_NAME") || env("BCN_SHIP_FROM_NAME") || "Base Camp North",
    organization: env("SHIP_FROM_ORGANIZATION") || env("SHIP_FROM_COMPANY") || env("BCN_SHIP_FROM_ORGANIZATION") || env("BCN_SHIP_FROM_COMPANY"),
    street1: env("SHIP_FROM_STREET1") || env("BCN_SHIP_FROM_STREET1"),
    street2: env("SHIP_FROM_STREET2") || env("BCN_SHIP_FROM_STREET2"),
    city: env("SHIP_FROM_CITY") || env("BCN_SHIP_FROM_CITY") || "Effort",
    state: env("SHIP_FROM_STATE") || env("BCN_SHIP_FROM_STATE") || "PA",
    zip: env("SHIP_FROM_ZIP") || env("BCN_SHIP_FROM_ZIP"),
    country: env("SHIP_FROM_COUNTRY") || env("BCN_SHIP_FROM_COUNTRY") || "US",
    phone: env("SHIP_FROM_PHONE") || env("BCN_SHIP_FROM_PHONE"),
    email: env("SHIP_FROM_EMAIL") || env("BCN_SHIP_FROM_EMAIL")
  });

  return isCompleteShippingAddress(address) ? address : null;
}

function getShipFromAddress(settings: ShippingSettings) {
  return settings.shipFromAddress ?? getEnvShipFromAddress();
}

async function shippoPost(path: string, token: string, body: Record<string, unknown>) {
  const response = await fetch(`${SHIPPO_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `ShippoToken ${token}`,
      "Content-Type": "application/json",
      "SHIPPO-API-VERSION": process.env.SHIPPO_API_VERSION || DEFAULT_SHIPPO_API_VERSION
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data?.detail === "string" ? data.detail : response.statusText;
    throw new Error(`Shippo request failed: ${detail}`);
  }

  return data as Record<string, unknown>;
}

async function shippoGet(path: string, token: string) {
  const response = await fetch(`${SHIPPO_API_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `ShippoToken ${token}`,
      "Content-Type": "application/json",
      "SHIPPO-API-VERSION": process.env.SHIPPO_API_VERSION || DEFAULT_SHIPPO_API_VERSION
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data?.detail === "string" ? data.detail : response.statusText;
    throw new Error(`Shippo request failed: ${detail}`);
  }

  return data as Record<string, unknown>;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

export type ShippoLabelPurchase = {
  rateId: string;
  transactionId: string;
  status: string;
  labelUrl: string;
  trackingNumber: string;
  trackingUrl: string;
  test: boolean;
  messages: string[];
};

export type ShippoLabelRefund = {
  transactionId: string;
  refundId: string;
  status: "QUEUED" | "PENDING" | "SUCCESS" | "ERROR" | string;
  test: boolean;
  messages: string[];
};

export async function purchaseShippoLabelFromRate(input: {
  rateId: string;
  labelFileType?: string;
  metadata?: string;
}): Promise<ShippoLabelPurchase> {
  const token = getShippoToken();
  if (!token) throw new Error("Shippo API token is not configured.");

  const data = await shippoPost("transactions/", token, {
    rate: input.rateId,
    async: false,
    label_file_type: input.labelFileType || process.env.SHIPPO_LABEL_FILE_TYPE || "PDF_4x6",
    metadata: input.metadata ? input.metadata.slice(0, 100) : undefined
  });

  return {
    rateId: input.rateId,
    transactionId: clean(data.object_id),
    status: clean(data.status) || clean(data.object_status) || "UNKNOWN",
    labelUrl: clean(data.label_url),
    trackingNumber: clean(data.tracking_number),
    trackingUrl: clean(data.tracking_url_provider),
    test: data.test === true,
    messages: stringArray(data.messages).concat(validationMessages(data.messages))
  };
}

export async function refundShippoLabel(input: {
  transactionId: string;
}): Promise<ShippoLabelRefund> {
  const token = getShippoToken();
  if (!token) throw new Error("Shippo API token is not configured.");

  const data = await shippoPost("refunds/", token, {
    transaction: input.transactionId,
    async: false
  });

  return {
    transactionId: clean(data.transaction) || input.transactionId,
    refundId: clean(data.object_id),
    status: clean(data.status) || "UNKNOWN",
    test: data.test === true,
    messages: stringArray(data.messages).concat(validationMessages(data.messages))
  };
}

export async function getShippoTrackingStatus(input: {
  carrier: string;
  trackingNumber: string;
}) {
  const token = getShippoToken();
  if (!token) throw new Error("Shippo API token is not configured.");

  const carrier = encodeURIComponent(input.carrier.toLowerCase());
  const trackingNumber = encodeURIComponent(input.trackingNumber);
  return shippoGet(`tracks/${carrier}/${trackingNumber}`, token);
}

function toShippoAddress(address: ShippingAddress) {
  return {
    name: address.name || address.organization || "BCN customer",
    company: address.organization || undefined,
    street1: address.street1,
    street2: address.street2 || undefined,
    city: address.city,
    state: address.state,
    zip: address.zip,
    country: address.country,
    phone: address.phone || undefined,
    email: address.email || undefined
  };
}

function validationMessages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const row = item as Record<string, unknown>;
      return clean(row.text) || clean(row.message) || clean(row.code);
    })
    .filter(Boolean);
}

async function validateDestinationAddress(token: string, address: ShippingAddress): Promise<{
  status: AddressValidationStatus;
  address: ShippingAddress | Record<string, unknown>;
  objectId: string | null;
  messages: string[];
}> {
  const data = await shippoPost("addresses/", token, {
    ...toShippoAddress(address),
    validate: true
  });

  const validation = data.validation_results && typeof data.validation_results === "object"
    ? data.validation_results as Record<string, unknown>
    : {};
  const messages = validationMessages(validation.messages);
  const objectId = clean(data.object_id) || null;
  const normalized = normalizeShippingAddress({
    name: data.name as string | undefined,
    organization: data.company as string | undefined,
    street1: data.street1 as string | undefined,
    street2: data.street2 as string | undefined,
    city: data.city as string | undefined,
    state: data.state as string | undefined,
    zip: data.zip as string | undefined,
    country: data.country as string | undefined,
    phone: data.phone as string | undefined,
    email: data.email as string | undefined
  });

  if (validation.is_valid === false || validation.is_complete === false) {
    return { status: "invalid", address: normalized, objectId, messages };
  }

  const status = JSON.stringify(normalized) === JSON.stringify(address) ? "validated" : "corrected";
  return { status, address: normalized, objectId, messages };
}

export function methodCodeFromShippoServiceToken(token: string): ShippingMethodCode | null {
  if (token === "usps_ground_advantage") return "usps_ground_advantage";
  if (token === "usps_priority") return "usps_priority";
  if (token === "usps_priority_express") return "usps_priority_express";
  return null;
}

function numberFromRate(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function parseRate(packageKey: string, shipmentId: string, row: unknown): LiveShippingRate | null {
  if (!row || typeof row !== "object") return null;
  const rate = row as Record<string, unknown>;
  const provider = clean(rate.provider).toUpperCase();
  if (provider !== "USPS") return null;

  const servicelevel = rate.servicelevel && typeof rate.servicelevel === "object"
    ? rate.servicelevel as Record<string, unknown>
    : {};
  const serviceToken = clean(servicelevel.token);
  const methodCode = methodCodeFromShippoServiceToken(serviceToken);
  const amount = numberFromRate(rate.amount);
  const rateId = clean(rate.object_id);

  if (!methodCode || amount === null || !rateId) return null;

  const estimatedDays = numberFromRate(rate.estimated_days);

  return {
    packageKey,
    shipmentId,
    rateId,
    methodCode,
    amountCents: Math.round(amount * 100),
    currency: "usd",
    carrier: "USPS",
    serviceName: clean(servicelevel.name) || serviceToken,
    serviceToken,
    estimatedDays,
    durationTerms: clean(rate.duration_terms) || undefined
  };
}

function parcelFromPackage(pkg: BuiltShippingPackage) {
  return {
    length: String(Math.max(pkg.lengthIn, 0.01)),
    width: String(Math.max(pkg.widthIn, 0.01)),
    height: String(Math.max(pkg.heightIn, 0.01)),
    distance_unit: "in",
    weight: String(Math.max(pkg.weightOz, 0.1)),
    mass_unit: "oz"
  };
}

async function createShipmentRates(input: {
  token: string;
  shipFromAddress: ShippingAddress;
  destinationAddress: ShippingAddress | Record<string, unknown>;
  destinationObjectId: string | null;
  pkg: BuiltShippingPackage;
}) {
  const addressTo = input.destinationObjectId
    ? input.destinationObjectId
    : toShippoAddress(normalizeShippingAddress(input.destinationAddress));

  const data = await shippoPost("shipments/", input.token, {
    address_from: toShippoAddress(input.shipFromAddress),
    address_to: addressTo,
    parcels: [parcelFromPackage(input.pkg)],
    async: false
  });

  const shipmentId = clean(data.object_id);
  const rawRates = Array.isArray(data.rates)
    ? data.rates
    : Array.isArray(data.rates_list)
      ? data.rates_list
      : [];

  return {
    packageKey: input.pkg.packageKey,
    shipmentId,
    rates: rawRates
      .map((rate) => parseRate(input.pkg.packageKey, shipmentId, rate))
      .filter((rate): rate is LiveShippingRate => Boolean(rate))
  };
}

export async function getShippoQuoteRates(input: {
  destinationAddress: ShippingAddress;
  packages: BuiltShippingPackage[];
  settings: ShippingSettings;
}): Promise<ShippoQuoteResult> {
  const token = getShippoToken();
  if (!input.settings.shippoEnabled || input.settings.liveRatesMaintenanceMode || !token) {
    console.warn("Shippo live rates skipped.", {
      shippoEnabled: input.settings.shippoEnabled,
      liveRatesMaintenanceMode: input.settings.liveRatesMaintenanceMode,
      hasShippoToken: Boolean(token)
    });
    return {
      providerAvailable: false,
      validationStatus: "validation_unavailable",
      validatedAddress: {},
      packageRates: [],
      messages: ["Live USPS rates are not configured."]
    };
  }

  const shipFromAddress = getShipFromAddress(input.settings);
  if (!shipFromAddress) {
    console.warn("Shippo live rates skipped: ship-from address is incomplete.");
    return {
      providerAvailable: false,
      validationStatus: "validation_unavailable",
      validatedAddress: {},
      packageRates: [],
      messages: ["Ship-from address is incomplete."]
    };
  }

  if (!isCompleteShippingAddress(input.destinationAddress)) {
    return {
      providerAvailable: true,
      validationStatus: "invalid",
      validatedAddress: {},
      packageRates: [],
      messages: ["Destination address is incomplete."]
    };
  }

  try {
    const validation = await validateDestinationAddress(token, input.destinationAddress);
    if (validation.status === "invalid") {
      return {
        providerAvailable: true,
        validationStatus: "invalid",
        validatedAddress: validation.address,
        packageRates: [],
        messages: validation.messages.length > 0 ? validation.messages : ["Destination address could not be validated."]
      };
    }

    const packageRates = await Promise.all(
      input.packages.map((pkg) =>
        createShipmentRates({
          token,
          shipFromAddress,
          destinationAddress: validation.address,
          destinationObjectId: validation.objectId,
          pkg
        })
      )
    );

    return {
      providerAvailable: true,
      validationStatus: validation.status,
      validatedAddress: validation.address,
      packageRates,
      messages: validation.messages
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shippo could not return live rates.";
    console.warn("Shippo live rates unavailable.", { message });
    return {
      providerAvailable: true,
      validationStatus: "validation_unavailable",
      validatedAddress: {},
      packageRates: [],
      messages: [message]
    };
  }
}
