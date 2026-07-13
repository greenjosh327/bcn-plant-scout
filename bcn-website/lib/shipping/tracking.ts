export type TrackingStatusValue = "PRE_TRANSIT" | "TRANSIT" | "DELIVERED" | "RETURNED" | "FAILURE" | "UNKNOWN";

export type ShippoTrackingUpdate = {
  carrier: string;
  trackingNumber: string;
  transactionId: string;
  status: TrackingStatusValue | "";
  statusDetail: string;
  substatus: string;
  actionRequired: boolean;
  statusDate: string;
  eta: string;
  trackingHistory: unknown[];
  trackingUrl: string;
  metadata: string;
  raw: Record<string, unknown>;
};

export type ShippoTransactionUpdate = {
  transactionId: string;
  status: string;
  trackingNumber: string;
  trackingUrl: string;
  metadata: string;
  raw: Record<string, unknown>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function dataObject(payload: unknown) {
  const row = object(payload);
  const data = object(row.data);
  return Object.keys(data).length > 0 ? data : row;
}

export function normalizeTrackingStatus(value: unknown): TrackingStatusValue | "" {
  const status = clean(value).toUpperCase();
  if (status === "PRE_TRANSIT" || status === "TRANSIT" || status === "DELIVERED" || status === "RETURNED" || status === "FAILURE" || status === "UNKNOWN") {
    return status;
  }
  return "";
}

export function formatTrackingStatus(status: string | null | undefined) {
  const value = clean(status);
  if (!value) return "";
  if (value === "PRE_TRANSIT") return "Pre Transit";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function parseShippoTrackingUpdate(payload: unknown): ShippoTrackingUpdate | null {
  const data = dataObject(payload);
  const trackingStatus = object(data.tracking_status);
  const substatus = object(trackingStatus.substatus);
  const trackingNumber = clean(data.tracking_number);

  if (!trackingNumber) return null;

  return {
    carrier: clean(data.carrier),
    trackingNumber,
    transactionId: clean(data.transaction),
    status: normalizeTrackingStatus(trackingStatus.status || data.tracking_status),
    statusDetail: clean(trackingStatus.status_details),
    substatus: clean(substatus.code) || clean(substatus.text),
    actionRequired: substatus.action_required === true,
    statusDate: clean(trackingStatus.status_date),
    eta: clean(data.eta),
    trackingHistory: Array.isArray(data.tracking_history) ? data.tracking_history : [],
    trackingUrl: clean(data.tracking_url_provider),
    metadata: clean(data.metadata),
    raw: data
  };
}

export function parseShippoTransactionUpdate(payload: unknown): ShippoTransactionUpdate | null {
  const data = dataObject(payload);
  const transactionId = clean(data.object_id);
  if (!transactionId) return null;

  return {
    transactionId,
    status: clean(data.status).toUpperCase(),
    trackingNumber: clean(data.tracking_number),
    trackingUrl: clean(data.tracking_url_provider),
    metadata: clean(data.metadata),
    raw: data
  };
}

export function mergeUniqueStrings(...values: Array<string[] | string | null | undefined>) {
  const seen = new Set<string>();
  for (const value of values) {
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      const cleaned = clean(item);
      if (cleaned) seen.add(cleaned);
    }
  }
  return Array.from(seen);
}

export function orderIdFromShippoMetadata(metadata: string | null | undefined) {
  const value = clean(metadata);
  const match = value.match(/\bbcn_order:([0-9a-fA-F-]{36})\b/);
  return match?.[1] ?? "";
}

export function carrierTokenFromOrderCarrier(carrier: string | null | undefined) {
  const value = clean(carrier).toLowerCase();
  if (value === "usps" || value === "us postal service" || value === "united states postal service") return "usps";
  return value;
}
