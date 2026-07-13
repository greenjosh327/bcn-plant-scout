import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseServiceClient } from "@/lib/supabase-service";
import type { ShippingQuoteOption, ShippingQuoteRecord } from "@/lib/shipping/types";

export const runtime = "nodejs";

type DbProduct = {
  id: string;
  name: string;
};

type DbVariant = {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
};

type OrderItemInsert = {
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  sku: string | null;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
};

function centsToDollars(cents?: number | null) {
  return Number(((cents ?? 0) / 100).toFixed(2));
}

function getStripeProduct(lineItem: Stripe.LineItem) {
  const product = lineItem.price?.product;
  if (!product || typeof product === "string" || "deleted" in product) return null;
  return product;
}

function getPaymentIntentId(session: Stripe.Checkout.Session) {
  const paymentIntent = session.payment_intent;
  if (!paymentIntent) return null;
  return typeof paymentIntent === "string" ? paymentIntent : paymentIntent.id;
}

function getCustomerId(session: Stripe.Checkout.Session) {
  const customer = session.customer;
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

function getShippingAddress(session: Stripe.Checkout.Session) {
  const address = session.shipping_details?.address ?? session.customer_details?.address;
  if (!address) return {};

  return {
    name: session.shipping_details?.name ?? session.customer_details?.name ?? null,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    postal_code: address.postal_code,
    country: address.country
  };
}

function hasKeys(value: Record<string, unknown>) {
  return Object.keys(value).length > 0;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function getSelectedQuoteOption(quote: ShippingQuoteRecord | null): ShippingQuoteOption | null {
  if (!quote) return null;
  if (quote.selected_option) return quote.selected_option;
  return quote.available_options.find((option) => option.id === quote.selected_option_id) ?? null;
}

async function fetchShippingQuote(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  session: Stripe.Checkout.Session
) {
  const quoteId = session.metadata?.shipping_quote_id;
  if (!quoteId && session.metadata?.fulfillment !== "shipping") return null;

  let query = supabase
    .from("shipping_quotes")
    .select("*");

  query = quoteId ? query.eq("id", quoteId) : query.eq("stripe_session_id", session.id);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`Could not load shipping quote for order: ${error.message}`);
  }

  return data as ShippingQuoteRecord | null;
}

function estimatedDelivery(option: ShippingQuoteOption | null) {
  if (!option) return null;
  if (option.durationTerms) return option.durationTerms;
  if (option.estimatedDays) return `${option.estimatedDays} business day${option.estimatedDays === 1 ? "" : "s"}`;
  return null;
}

async function markShippingQuoteConverted(input: {
  supabase: ReturnType<typeof getSupabaseServiceClient>;
  session: Stripe.Checkout.Session;
  quoteId?: string | null;
  orderId: string;
}) {
  const quoteId = input.quoteId || input.session.metadata?.shipping_quote_id || null;
  if (!quoteId && input.session.metadata?.fulfillment !== "shipping") return;

  let query = input.supabase
    .from("shipping_quotes")
    .update({
      quote_status: "converted",
      stripe_session_id: input.session.id,
      used_at: new Date().toISOString()
    });

  query = quoteId ? query.eq("id", quoteId) : query.eq("stripe_session_id", input.session.id);

  const { error } = await query;
  if (error) {
    console.error("Order saved, but shipping quote status update failed.", {
      orderId: input.orderId,
      shippingQuoteId: quoteId,
      stripeSessionId: input.session.id,
      error
    });
  }
}

async function fetchProductsAndVariants(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  productIds: string[],
  variantIds: string[]
) {
  const [{ data: products }, { data: variants }] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id,name").in("id", productIds)
      : Promise.resolve({ data: [] as DbProduct[] }),
    variantIds.length > 0
      ? supabase.from("product_variants").select("id,product_id,name,sku").in("id", variantIds)
      : Promise.resolve({ data: [] as DbVariant[] })
  ]);

  return {
    productById: new Map((products ?? []).map((product) => [product.id, product as DbProduct])),
    variantById: new Map((variants ?? []).map((variant) => [variant.id, variant as DbVariant]))
  };
}

async function createOrCompleteOrder(session: Stripe.Checkout.Session, stripe: Stripe) {
  const supabase = getSupabaseServiceClient();

  const { data: existingOrder, error: existingError } = await supabase
    .from("orders")
    .select("id")
    .eq("stripe_session_id", session.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Could not check existing order: ${existingError.message}`);
  }

  if (existingOrder) {
    const { count, error: countError } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("order_id", existingOrder.id);

    if (countError) {
      throw new Error(`Could not check existing order items: ${countError.message}`);
    }

    if ((count ?? 0) > 0) {
      await markShippingQuoteConverted({
        supabase,
        session,
        quoteId: session.metadata?.shipping_quote_id,
        orderId: existingOrder.id
      });
      return { status: "duplicate", orderId: existingOrder.id };
    }
  }

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 100,
    expand: ["data.price.product"]
  });

  const productIds = lineItems.data
    .map((lineItem) => getStripeProduct(lineItem)?.metadata.product_id)
    .filter((value): value is string => Boolean(value));
  const variantIds = lineItems.data
    .map((lineItem) => getStripeProduct(lineItem)?.metadata.variant)
    .filter((value): value is string => Boolean(value));

  const { productById, variantById } = await fetchProductsAndVariants(supabase, productIds, variantIds);
  const shippingQuote = await fetchShippingQuote(supabase, session);
  const selectedShippingOption = getSelectedQuoteOption(shippingQuote);
  const stripeShippingAddress = getShippingAddress(session);

  let orderId = existingOrder?.id as string | undefined;

  if (!orderId) {
    const { data: insertedOrder, error: insertError } = await supabase
      .from("orders")
      .insert({
        stripe_session_id: session.id,
        stripe_payment_intent: getPaymentIntentId(session),
        stripe_customer_id: getCustomerId(session),
        customer_name: session.customer_details?.name ?? session.shipping_details?.name ?? null,
        customer_email: session.customer_details?.email ?? session.customer_email ?? null,
        phone: session.customer_details?.phone ?? null,
        order_status: "new",
        payment_status: session.payment_status ?? "unpaid",
        fulfillment_type: session.metadata?.fulfillment === "shipping" ? "shipping" : "pickup",
        pickup_location: session.metadata?.fulfillment === "shipping" ? null : "Base Camp North local pickup",
        shipping_address: hasKeys(stripeShippingAddress) ? stripeShippingAddress : shippingQuote?.destination_address ?? {},
        shipping_quote_id: shippingQuote?.id ?? null,
        shipping_method_code: selectedShippingOption?.methodCode ?? session.metadata?.shipping_method_code ?? null,
        shipping_method_name: selectedShippingOption?.displayName ?? session.metadata?.shipping_method_name ?? null,
        shipping_provider: selectedShippingOption?.provider ?? session.metadata?.shipping_provider ?? null,
        shipping_carrier: selectedShippingOption?.carrier ?? session.metadata?.shipping_carrier ?? null,
        shipping_service: selectedShippingOption?.serviceName ?? session.metadata?.shipping_service ?? null,
        shipping_amount_cents: selectedShippingOption?.amountCents ?? session.total_details?.amount_shipping ?? null,
        address_validation_status: shippingQuote?.address_validation_status ?? session.metadata?.address_validation_status ?? null,
        validated_shipping_address: shippingQuote?.validated_address ?? {},
        untracked_shipping_acknowledged: shippingQuote?.untracked_shipping_acknowledged ?? session.metadata?.untracked_shipping_acknowledged === "true",
        package_plan: shippingQuote?.package_plan ?? [],
        shippo_shipment_ids: stringArray(selectedShippingOption?.shippoShipmentIds),
        shippo_rate_ids: stringArray(selectedShippingOption?.shippoRateIds),
        estimated_delivery: estimatedDelivery(selectedShippingOption),
        subtotal: centsToDollars(session.amount_subtotal),
        shipping_cost: centsToDollars(session.total_details?.amount_shipping),
        tax: centsToDollars(session.total_details?.amount_tax),
        total: centsToDollars(session.amount_total),
        currency: session.currency ?? "usd"
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        const { data: racedOrder } = await supabase
          .from("orders")
          .select("id")
          .eq("stripe_session_id", session.id)
          .maybeSingle();
        orderId = racedOrder?.id;
      } else {
        throw new Error(`Could not create order: ${insertError.message}`);
      }
    } else {
      orderId = insertedOrder.id;
    }
  }

  if (!orderId) {
    throw new Error("Order id was not available after insert.");
  }

  const orderItems: OrderItemInsert[] = lineItems.data.map((lineItem) => {
    const stripeProduct = getStripeProduct(lineItem);
    const productId = stripeProduct?.metadata.product_id || null;
    const variantId = stripeProduct?.metadata.variant || null;
    const product = productId ? productById.get(productId) : null;
    const variant = variantId ? variantById.get(variantId) : null;
    const quantity = lineItem.quantity ?? 1;
    const lineTotal = centsToDollars(lineItem.amount_subtotal);

    return {
      order_id: orderId,
      product_id: productId,
      variant_id: variantId,
      sku: variant?.sku ?? null,
      product_name: product?.name ?? stripeProduct?.name ?? lineItem.description ?? "BCN shop item",
      variant_name: variant?.name ?? null,
      quantity,
      unit_price: quantity > 0 ? Number((lineTotal / quantity).toFixed(2)) : lineTotal,
      line_total: lineTotal
    };
  });

  if (orderItems.length > 0) {
    const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
    if (itemsError) {
      throw new Error(`Could not create order items: ${itemsError.message}`);
    }
  }

  for (const item of orderItems) {
    try {
      if (item.variant_id) {
        const { error } = await supabase.rpc("decrement_product_variant_inventory", {
          target_variant_id: item.variant_id,
          purchased_quantity: item.quantity
        });
        if (error) throw error;
      } else if (item.product_id) {
        const { error } = await supabase.rpc("decrement_product_inventory", {
          target_product_id: item.product_id,
          purchased_quantity: item.quantity
        });
        if (error) throw error;
      }
    } catch (error) {
      console.error("Order saved, but inventory update failed.", {
        orderId,
        productId: item.product_id,
        variantId: item.variant_id,
        error
      });
    }
  }

  if (shippingQuote?.id) {
    await markShippingQuoteConverted({
      supabase,
      session,
      quoteId: shippingQuote.id,
      orderId
    });
  }

  return { status: "created", orderId };
}

export async function POST(request: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey || !webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 500 });
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2025-02-24.acacia"
  });

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  const body = await request.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook signature.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  try {
    const session = event.data.object as Stripe.Checkout.Session;
    const result = await createOrCompleteOrder(session, stripe);
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    console.error("Stripe checkout.session.completed webhook failed.", error);
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
