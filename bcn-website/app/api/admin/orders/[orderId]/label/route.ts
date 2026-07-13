import { NextResponse } from "next/server";
import { jsonError, requireAdmin, selectOrderWithItems } from "@/lib/admin-api";
import { getSupabaseServiceClient } from "@/lib/supabase-service";
import { getLabelPurchaseEligibility, type LabelPurchaseOrder } from "@/lib/shipping/label-purchase";
import { purchaseShippoLabelFromRate, type ShippoLabelPurchase } from "@/lib/shipping/shippo-provider";

export const runtime = "nodejs";

type OrderRow = LabelPurchaseOrder & {
  id: string;
  order_status: string;
  label_purchase_status: string;
  label_urls: string[] | null;
  tracking_numbers: string[] | null;
  tracking_urls: string[] | null;
  label_purchase_error: string | null;
};

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

async function loadOrder(supabase: ReturnType<typeof getSupabaseServiceClient>, orderId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(`Could not load order: ${error.message}`);
  return data as OrderRow | null;
}

function purchaseSucceeded(purchase: ShippoLabelPurchase) {
  return purchase.status === "SUCCESS" && Boolean(purchase.transactionId && purchase.labelUrl);
}

function purchaseFailureMessage(purchases: ShippoLabelPurchase[]) {
  const failed = purchases.find((purchase) => !purchaseSucceeded(purchase));
  if (!failed) return null;
  const details = failed.messages.length > 0 ? ` ${failed.messages.join(" ")}` : "";
  return `Shippo label purchase returned ${failed.status || "an unknown status"} for rate ${failed.rateId}.${details}`.trim();
}

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  if (!orderId) return jsonError("Order id is required.", 400);

  let supabase: ReturnType<typeof getSupabaseServiceClient>;
  try {
    supabase = getSupabaseServiceClient();
  } catch {
    return jsonError("Supabase service role configuration is missing.", 500);
  }

  const admin = await requireAdmin(request, supabase);
  if ("error" in admin) {
    const message = typeof admin.error === "string" ? admin.error : "Admin authorization failed.";
    const status = typeof admin.status === "number" ? admin.status : 403;
    return jsonError(message, status);
  }

  try {
    const order = await loadOrder(supabase, orderId);
    if (!order) return jsonError("Order was not found.", 404);

    const eligibility = getLabelPurchaseEligibility(order);
    if (!eligibility.eligible) return jsonError(eligibility.reason, 400);

    const startingStatus = order.label_purchase_status || "not_started";
    const { data: reserved, error: reserveError } = await supabase
      .from("orders")
      .update({
        label_purchase_status: "purchasing",
        label_purchase_error: null,
        label_provider: "shippo"
      })
      .eq("id", order.id)
      .eq("label_purchase_status", startingStatus)
      .select("id")
      .maybeSingle();

    if (reserveError) throw new Error(`Could not reserve label purchase: ${reserveError.message}`);
    if (!reserved) return jsonError("A label purchase is already in progress for this order.", 409);

    const rateIds = stringArray(order.shippo_rate_ids);
    let purchases: ShippoLabelPurchase[] = [];
    try {
      purchases = [];
      for (const rateId of rateIds) {
        purchases.push(await purchaseShippoLabelFromRate({
          rateId,
          metadata: `bcn_order:${order.id}`
        }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Shippo label purchase failed.";
      const partialLabelUrls = purchases.map((purchase) => purchase.labelUrl).filter(Boolean);
      const partialTrackingNumbers = purchases.map((purchase) => purchase.trackingNumber).filter(Boolean);
      const partialTrackingUrls = purchases.map((purchase) => purchase.trackingUrl).filter(Boolean);
      const partialTransactionIds = purchases.map((purchase) => purchase.transactionId).filter(Boolean);
      const { data: updated } = await supabase
        .from("orders")
        .update({
          label_purchase_status: "failed",
          label_purchase_error: message,
          label_transaction_ids: partialTransactionIds,
          label_rate_ids: rateIds,
          label_urls: partialLabelUrls,
          label_file_type: process.env.SHIPPO_LABEL_FILE_TYPE || "PDF_4x6",
          label_purchase_test_mode: purchases.some((purchase) => purchase.test),
          label_metadata: { purchases },
          tracking_numbers: partialTrackingNumbers,
          tracking_urls: partialTrackingUrls,
          tracking_status: partialTrackingNumbers.length > 0 ? "PRE_TRANSIT" : null
        })
        .eq("id", order.id)
        .select("id")
        .maybeSingle();

      if (!updated) console.error("Could not mark label purchase failed.", { orderId: order.id, message });
      const updatedOrder = updated ? await selectOrderWithItems(supabase, order.id) : null;
      return NextResponse.json({ error: message, order: updatedOrder }, { status: 502 });
    }

    const failedMessage = purchaseFailureMessage(purchases);
    const success = !failedMessage;
    const labelUrls = purchases.map((purchase) => purchase.labelUrl).filter(Boolean);
    const trackingNumbers = purchases.map((purchase) => purchase.trackingNumber).filter(Boolean);
    const trackingUrls = purchases.map((purchase) => purchase.trackingUrl).filter(Boolean);
    const transactionIds = purchases.map((purchase) => purchase.transactionId).filter(Boolean);

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        label_purchase_status: success ? "purchased" : "failed",
        label_provider: "shippo",
        label_transaction_ids: transactionIds,
        label_rate_ids: rateIds,
        label_urls: labelUrls,
        label_file_type: process.env.SHIPPO_LABEL_FILE_TYPE || "PDF_4x6",
        label_purchase_test_mode: purchases.some((purchase) => purchase.test),
        label_purchased_at: success ? new Date().toISOString() : null,
        label_purchase_error: failedMessage,
        label_metadata: { purchases },
        tracking_numbers: trackingNumbers,
        tracking_urls: trackingUrls,
        tracking_status: trackingNumbers.length > 0 ? "PRE_TRANSIT" : null
      })
      .eq("id", order.id);

    if (updateError) throw new Error(`Could not save label details: ${updateError.message}`);

    const updatedOrder = await selectOrderWithItems(supabase, order.id);
    return NextResponse.json({
      order: updatedOrder,
      labelPurchaseStatus: success ? "purchased" : "failed",
      error: failedMessage
    }, { status: success ? 200 : 502 });
  } catch (error) {
    console.error("Admin label purchase failed.", error);
    const message = error instanceof Error ? error.message : "Label purchase failed.";
    return jsonError(message, 500);
  }
}
