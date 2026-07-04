import Link from "next/link";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

type SuccessPageProps = {
  searchParams?: Promise<{
    session_id?: string;
  }>;
};

type OrderItem = {
  id: string;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  line_total: number;
};

type ReceiptOrder = {
  id: string;
  stripe_session_id: string;
  created_at: string;
  customer_name: string | null;
  customer_email: string | null;
  order_status: string;
  payment_status: string;
  fulfillment_type: "pickup" | "shipping";
  pickup_location: string | null;
  subtotal: number;
  shipping_cost: number;
  tax: number;
  total: number;
  currency: string;
  order_items: OrderItem[];
};

async function getOrder(sessionId?: string) {
  if (!sessionId) return null;

  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("orders")
      .select(`
        id,
        stripe_session_id,
        created_at,
        customer_name,
        customer_email,
        order_status,
        payment_status,
        fulfillment_type,
        pickup_location,
        subtotal,
        shipping_cost,
        tax,
        total,
        currency,
        order_items (
          id,
          product_name,
          variant_name,
          quantity,
          line_total
        )
      `)
      .eq("stripe_session_id", sessionId)
      .maybeSingle();

    if (error) {
      console.error("Could not load checkout receipt order.", error);
      return null;
    }

    return data as ReceiptOrder | null;
  } catch (error) {
    console.error("Receipt lookup is not configured.", error);
    return null;
  }
}

export default async function CartSuccessPage({ searchParams }: SuccessPageProps) {
  const params = await searchParams;
  const order = await getOrder(params?.session_id);

  return (
    <main className="container py-12">
      <section className="field-card max-w-3xl p-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-stone">Order received</p>
        <h1 className="mt-3 text-5xl font-black text-pine">Thanks for your order.</h1>
        <p className="mt-5 text-lg leading-8 text-ink/75">
          Stripe accepted the payment. Base Camp North will follow up with pickup or shipping details.
        </p>

        {order ? (
          <div className="mt-8 grid gap-5">
            <div className="rounded-md border border-pine/15 bg-sage p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-stone">Order summary</p>
              <p className="mt-2 text-2xl font-black text-pine">{formatMoney(Number(order.total), order.currency)}</p>
              <p className="mt-1 text-sm font-bold text-ink/70">
                {formatStatus(order.payment_status)} / {formatStatus(order.order_status)} / {order.fulfillment_type}
              </p>
            </div>

            <div className="overflow-hidden rounded-md border border-pine/15">
              {order.order_items.map((item) => (
                <div key={item.id} className="grid gap-2 border-b border-pine/10 bg-white p-4 last:border-b-0 sm:grid-cols-[1fr_80px_100px]">
                  <div>
                    <p className="font-black text-pine">{item.product_name}</p>
                    <p className="text-sm font-bold text-stone">{item.variant_name || "Regular"}</p>
                  </div>
                  <p className="font-black text-pine">Qty {item.quantity}</p>
                  <p className="font-black text-pine">{formatMoney(Number(item.line_total), order.currency)}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 rounded-md border border-pine/15 bg-white p-4 text-sm font-bold text-ink/75">
              <p>Subtotal: {formatMoney(Number(order.subtotal), order.currency)}</p>
              <p>Shipping: {formatMoney(Number(order.shipping_cost), order.currency)}</p>
              <p>Tax: {formatMoney(Number(order.tax), order.currency)}</p>
              <p>Fulfillment: {order.fulfillment_type === "pickup" ? order.pickup_location || "Base Camp North local pickup" : "Shipping"}</p>
              {order.customer_email ? <p>Receipt email: {order.customer_email}</p> : null}
            </div>
          </div>
        ) : (
          <div className="mt-8 rounded-md border border-pine/15 bg-sage p-4">
            <p className="font-black text-pine">Payment complete.</p>
            <p className="mt-2 text-ink/70">
              The order record may still be writing from Stripe. If this page does not show details yet,
              refresh in a minute or contact BCN.
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="button button-primary" href="/shop">Back to shop</Link>
          <Link className="button button-secondary" href="/contact">Contact BCN</Link>
        </div>
      </section>
    </main>
  );
}

function formatMoney(value: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase()
  }).format(Number(value) || 0);
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
