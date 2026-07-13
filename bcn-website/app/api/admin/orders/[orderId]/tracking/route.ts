import { NextResponse } from "next/server";
import { jsonError, requireAdmin, selectOrderWithItems } from "@/lib/admin-api";
import { getSupabaseServiceClient } from "@/lib/supabase-service";
import { getShippoTrackingStatus } from "@/lib/shipping/shippo-provider";
import {
  carrierTokenFromOrderCarrier,
  mergeUniqueStrings,
  parseShippoTrackingUpdate
} from "@/lib/shipping/tracking";

export const runtime = "nodejs";

type OrderRow = {
  id: string;
  shipping_carrier: string | null;
  tracking_carrier: string | null;
  tracking_numbers: string[] | null;
  tracking_urls: string[] | null;
  tracking_status: string | null;
  tracking_history: unknown[] | null;
};

async function loadOrder(supabase: ReturnType<typeof getSupabaseServiceClient>, orderId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("id, shipping_carrier, tracking_carrier, tracking_numbers, tracking_urls, tracking_status, tracking_history")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(`Could not load order: ${error.message}`);
  return data as OrderRow | null;
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

    const trackingNumber = order.tracking_numbers?.find(Boolean);
    if (!trackingNumber) return jsonError("No tracking number is saved for this order.", 400);

    const carrier = carrierTokenFromOrderCarrier(order.tracking_carrier || order.shipping_carrier);
    if (!carrier) return jsonError("Tracking carrier is not available for this order.", 400);

    const tracking = parseShippoTrackingUpdate(await getShippoTrackingStatus({ carrier, trackingNumber }));
    if (!tracking) return jsonError("Shippo did not return a usable tracking response.", 502);

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        tracking_carrier: tracking.carrier || carrier,
        tracking_numbers: mergeUniqueStrings(order.tracking_numbers, tracking.trackingNumber),
        tracking_urls: mergeUniqueStrings(order.tracking_urls, tracking.trackingUrl),
        tracking_status: tracking.status || order.tracking_status,
        tracking_status_detail: tracking.statusDetail || null,
        tracking_substatus: tracking.substatus || null,
        tracking_action_required: tracking.actionRequired,
        tracking_eta: tracking.eta || null,
        tracking_history: tracking.trackingHistory.length > 0 ? tracking.trackingHistory : order.tracking_history ?? [],
        tracking_metadata: tracking.raw,
        tracking_updated_at: new Date().toISOString()
      })
      .eq("id", order.id);

    if (updateError) throw new Error(`Could not save tracking details: ${updateError.message}`);

    const updatedOrder = await selectOrderWithItems(supabase, order.id);
    return NextResponse.json({ order: updatedOrder, trackingStatus: tracking.status });
  } catch (error) {
    console.error("Admin tracking refresh failed.", error);
    const message = error instanceof Error ? error.message : "Tracking refresh failed.";
    return jsonError(message, 500);
  }
}
