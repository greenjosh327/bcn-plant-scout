import { NextResponse } from "next/server";
import { jsonError, requireAdmin, selectOrderWithItems } from "@/lib/admin-api";
import { getSupabaseServiceClient } from "@/lib/supabase-service";
import { getLabelRefundEligibility, type LabelRefundOrder } from "@/lib/shipping/label-purchase";
import { refundShippoLabel, type ShippoLabelRefund } from "@/lib/shipping/shippo-provider";

export const runtime = "nodejs";

type OrderRow = LabelRefundOrder & {
  id: string;
  label_purchase_error: string | null;
  label_refund_error: string | null;
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

function refundStatus(refunds: ShippoLabelRefund[]) {
  const failed = refunds.find((refund) => refund.status === "ERROR");
  if (failed) {
    return {
      labelPurchaseStatus: "refund_failed",
      labelRefundStatus: "error",
      error: `Shippo label refund returned ERROR for transaction ${failed.transactionId}.`
    };
  }

  if (refunds.length > 0 && refunds.every((refund) => refund.status === "SUCCESS")) {
    return {
      labelPurchaseStatus: "refunded",
      labelRefundStatus: "success",
      error: null
    };
  }

  return {
    labelPurchaseStatus: "refund_pending",
    labelRefundStatus: refunds.some((refund) => refund.status === "PENDING") ? "pending" : "queued",
    error: null
  };
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

    const eligibility = getLabelRefundEligibility(order);
    if (!eligibility.eligible) return jsonError(eligibility.reason, 400);

    const startingStatus = order.label_purchase_status || "purchased";
    const now = new Date().toISOString();
    const { data: reserved, error: reserveError } = await supabase
      .from("orders")
      .update({
        label_purchase_status: "refund_pending",
        label_refund_status: "requested",
        label_refund_requested_at: now,
        label_refund_updated_at: now,
        label_refund_error: null,
        label_purchase_error: null
      })
      .eq("id", order.id)
      .eq("label_purchase_status", startingStatus)
      .select("id")
      .maybeSingle();

    if (reserveError) throw new Error(`Could not reserve label refund: ${reserveError.message}`);
    if (!reserved) return jsonError("A label refund is already in progress for this order.", 409);

    const transactionIds = stringArray(order.label_transaction_ids);
    let refunds: ShippoLabelRefund[] = [];

    try {
      refunds = [];
      for (const transactionId of transactionIds) {
        refunds.push(await refundShippoLabel({ transactionId }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Shippo label refund failed.";
      const partialRefundIds = refunds.map((refund) => refund.refundId).filter(Boolean);
      await supabase
        .from("orders")
        .update({
          label_purchase_status: "refund_failed",
          label_refund_status: "error",
          label_refund_ids: partialRefundIds,
          label_refund_updated_at: new Date().toISOString(),
          label_refund_error: message,
          label_refund_metadata: { refunds }
        })
        .eq("id", order.id);

      const updatedOrder = await selectOrderWithItems(supabase, order.id);
      return NextResponse.json({ error: message, order: updatedOrder }, { status: 502 });
    }

    const outcome = refundStatus(refunds);
    const refundIds = refunds.map((refund) => refund.refundId).filter(Boolean);
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        label_purchase_status: outcome.labelPurchaseStatus,
        label_refund_status: outcome.labelRefundStatus,
        label_refund_ids: refundIds,
        label_refund_updated_at: new Date().toISOString(),
        label_refund_error: outcome.error,
        label_refund_metadata: { refunds }
      })
      .eq("id", order.id);

    if (updateError) throw new Error(`Could not save label refund details: ${updateError.message}`);

    const updatedOrder = await selectOrderWithItems(supabase, order.id);
    return NextResponse.json({
      order: updatedOrder,
      labelPurchaseStatus: outcome.labelPurchaseStatus,
      labelRefundStatus: outcome.labelRefundStatus,
      error: outcome.error
    }, { status: outcome.error ? 502 : 200 });
  } catch (error) {
    console.error("Admin label void failed.", error);
    const message = error instanceof Error ? error.message : "Label void failed.";
    return jsonError(message, 500);
  }
}
