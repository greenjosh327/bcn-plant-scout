import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";
import {
  mergeUniqueStrings,
  orderIdFromShippoMetadata,
  parseShippoTrackingUpdate,
  parseShippoTransactionUpdate,
  type ShippoTrackingUpdate,
  type ShippoTransactionUpdate
} from "@/lib/shipping/tracking";

export const runtime = "nodejs";

type TrackedOrderRow = {
  id: string;
  tracking_numbers: string[] | null;
  tracking_urls: string[] | null;
  tracking_status: string | null;
  tracking_history: unknown[] | null;
  label_transaction_ids: string[] | null;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function webhookToken(request: Request) {
  const url = new URL(request.url);
  return clean(url.searchParams.get("token")) || clean(request.headers.get("x-shippo-webhook-token"));
}

function safeEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function expectedWebhookToken() {
  return clean(process.env.SHIPPO_WEBHOOK_TOKEN) || clean(process.env.SHIPPO_TRACKING_WEBHOOK_TOKEN);
}

async function loadOrderById(supabase: ReturnType<typeof getSupabaseServiceClient>, orderId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("id, tracking_numbers, tracking_urls, tracking_status, tracking_history, label_transaction_ids")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(`Could not load order: ${error.message}`);
  return data as TrackedOrderRow | null;
}

async function findOrderForUpdate(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  input: { metadata?: string; transactionId?: string; trackingNumber?: string }
) {
  const metadataOrderId = orderIdFromShippoMetadata(input.metadata);
  if (metadataOrderId) {
    const byMetadata = await loadOrderById(supabase, metadataOrderId);
    if (byMetadata) return byMetadata;
  }

  if (input.transactionId) {
    const { data, error } = await supabase
      .from("orders")
      .select("id, tracking_numbers, tracking_urls, tracking_status, tracking_history, label_transaction_ids")
      .contains("label_transaction_ids", [input.transactionId])
      .maybeSingle();

    if (error) throw new Error(`Could not match order by Shippo transaction: ${error.message}`);
    if (data) return data as TrackedOrderRow;
  }

  if (input.trackingNumber) {
    const { data, error } = await supabase
      .from("orders")
      .select("id, tracking_numbers, tracking_urls, tracking_status, tracking_history, label_transaction_ids")
      .contains("tracking_numbers", [input.trackingNumber])
      .maybeSingle();

    if (error) throw new Error(`Could not match order by tracking number: ${error.message}`);
    if (data) return data as TrackedOrderRow;
  }

  return null;
}

async function saveTrackingUpdate(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  order: TrackedOrderRow,
  update: ShippoTrackingUpdate
) {
  const { error } = await supabase
    .from("orders")
    .update({
      tracking_carrier: update.carrier || null,
      tracking_numbers: mergeUniqueStrings(order.tracking_numbers, update.trackingNumber),
      tracking_urls: mergeUniqueStrings(order.tracking_urls, update.trackingUrl),
      tracking_status: update.status || order.tracking_status,
      tracking_status_detail: update.statusDetail || null,
      tracking_substatus: update.substatus || null,
      tracking_action_required: update.actionRequired,
      tracking_eta: update.eta || null,
      tracking_history: update.trackingHistory.length > 0 ? update.trackingHistory : order.tracking_history ?? [],
      tracking_metadata: update.raw,
      tracking_updated_at: new Date().toISOString()
    })
    .eq("id", order.id);

  if (error) throw new Error(`Could not save tracking webhook update: ${error.message}`);
}

function transactionRefundPatch(update: ShippoTransactionUpdate) {
  if (update.status === "REFUNDED") {
    return { label_purchase_status: "refunded", label_refund_status: "success", label_refund_error: null };
  }
  if (update.status === "REFUNDPENDING") {
    return { label_purchase_status: "refund_pending", label_refund_status: "pending", label_refund_error: null };
  }
  if (update.status === "REFUNDREJECTED") {
    return { label_purchase_status: "refund_rejected", label_refund_status: "error", label_refund_error: "Shippo rejected the label refund request." };
  }
  return {};
}

async function saveTransactionUpdate(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  order: TrackedOrderRow,
  update: ShippoTransactionUpdate
) {
  const patch = {
    ...transactionRefundPatch(update),
    label_refund_metadata: { last_transaction_webhook: update.raw },
    tracking_numbers: mergeUniqueStrings(order.tracking_numbers, update.trackingNumber),
    tracking_urls: mergeUniqueStrings(order.tracking_urls, update.trackingUrl),
    tracking_status: update.raw.tracking_status ? clean(update.raw.tracking_status) : order.tracking_status,
    tracking_updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from("orders")
    .update(patch)
    .eq("id", order.id);

  if (error) throw new Error(`Could not save transaction webhook update: ${error.message}`);
}

export async function POST(request: Request) {
  const expectedToken = expectedWebhookToken();
  if (!expectedToken) {
    return NextResponse.json({ error: "Shippo webhook token is not configured." }, { status: 503 });
  }

  if (!safeEquals(webhookToken(request), expectedToken)) {
    return NextResponse.json({ error: "Shippo webhook token is not valid." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Webhook payload was not valid JSON." }, { status: 400 });
  }

  const event = clean((payload as Record<string, unknown>)?.event);
  if (!["track_updated", "transaction_updated"].includes(event)) {
    return NextResponse.json({ received: true, handled: false });
  }

  let supabase: ReturnType<typeof getSupabaseServiceClient>;
  try {
    supabase = getSupabaseServiceClient();
  } catch {
    return NextResponse.json({ error: "Supabase service role configuration is missing." }, { status: 500 });
  }

  try {
    if (event === "track_updated") {
      const tracking = parseShippoTrackingUpdate(payload);
      if (!tracking) return NextResponse.json({ received: true, handled: false });

      const order = await findOrderForUpdate(supabase, {
        metadata: tracking.metadata,
        transactionId: tracking.transactionId,
        trackingNumber: tracking.trackingNumber
      });
      if (!order) return NextResponse.json({ received: true, handled: false, matched: false });

      await saveTrackingUpdate(supabase, order, tracking);
      return NextResponse.json({ received: true, handled: true, orderId: order.id });
    }

    const transaction = parseShippoTransactionUpdate(payload);
    if (!transaction) return NextResponse.json({ received: true, handled: false });

    const order = await findOrderForUpdate(supabase, {
      metadata: transaction.metadata,
      transactionId: transaction.transactionId,
      trackingNumber: transaction.trackingNumber
    });
    if (!order) return NextResponse.json({ received: true, handled: false, matched: false });

    await saveTransactionUpdate(supabase, order, transaction);
    return NextResponse.json({ received: true, handled: true, orderId: order.id });
  } catch (error) {
    console.error("Shippo webhook processing failed.", error);
    const message = error instanceof Error ? error.message : "Shippo webhook processing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
