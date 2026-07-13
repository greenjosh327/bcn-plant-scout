import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "./supabase-service";

export type SupabaseServiceClient = ReturnType<typeof getSupabaseServiceClient>;

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const [type, token] = header.split(" ");
  return type?.toLowerCase() === "bearer" ? token : "";
}
export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireAdmin(request: Request, supabase: SupabaseServiceClient) {
  const token = bearerToken(request);
  if (!token) return { error: "Admin session is missing.", status: 401 } as const;

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return { error: "Admin session is not valid.", status: 401 } as const;

  const { data: admin, error: adminError } = await supabase
    .from("bcn_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError || !admin) {
    return { error: "This account is not listed as a BCN admin.", status: 403 } as const;
  }

  return { user } as const;
}

export async function selectOrderWithItems(supabase: SupabaseServiceClient, orderId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select(`
      *,
      order_items (
        id,
        order_id,
        product_id,
        variant_id,
        sku,
        product_name,
        variant_name,
        quantity,
        unit_price,
        line_total
      )
    `)
    .eq("id", orderId)
    .single();

  if (error) throw new Error(`Could not reload order: ${error.message}`);
  return data;
}
