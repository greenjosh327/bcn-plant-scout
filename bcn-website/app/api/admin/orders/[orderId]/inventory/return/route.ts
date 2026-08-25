import { NextResponse } from "next/server";
import { jsonError, requireAdmin, selectOrderWithItems } from "@/lib/admin-api";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const runtime = "nodejs";

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
    const { data, error } = await supabase.rpc("return_order_inventory", {
      target_order_id: orderId,
      target_created_by: admin.user.id
    });

    if (error) {
      return jsonError(error.message || "Inventory could not be returned.", 400);
    }

    const updatedOrder = await selectOrderWithItems(supabase, orderId);
    return NextResponse.json({ order: updatedOrder, inventory: data });
  } catch (error) {
    console.error("Admin inventory return failed.", error);
    const message = error instanceof Error ? error.message : "Inventory return failed.";
    return jsonError(message, 500);
  }
}
