import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseServiceClient } from "@/lib/supabase-service";
import {
  buildGa4PurchasePayload,
  getGa4PurchaseAcknowledgementStatus,
  getGa4PurchaseEligibility,
  type PurchaseOrder
} from "@/lib/marketing/purchase-event";

export const runtime = "nodejs";

type PurchaseAction = "prepare" | "acknowledge";

type PurchaseRequestBody = {
  action?: PurchaseAction;
  sessionId?: string;
  session_id?: string;
  transactionId?: string;
  transaction_id?: string;
};

type SupabaseServiceClient = ReturnType<typeof getSupabaseServiceClient>;

const PURCHASE_ORDER_SELECT = `
  id,
  stripe_session_id,
  stripe_payment_intent,
  payment_status,
  order_status,
  shipping_cost,
  tax,
  total,
  currency,
  coupon_code,
  ga4_purchase_tracked_at,
  ga4_purchase_transaction_id,
  order_items (
    id,
    product_id,
    variant_id,
    sku,
    product_name,
    variant_name,
    quantity,
    unit_price,
    line_total
  )
`;

export async function POST(request: Request) {
  if (!originAllowed(request)) {
    return NextResponse.json({ error: "Analytics origin is not allowed." }, { status: 403 });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 500 });
  }

  let body: PurchaseRequestBody;
  try {
    body = (await request.json()) as PurchaseRequestBody;
  } catch {
    return NextResponse.json({ error: "Purchase request was not valid JSON." }, { status: 400 });
  }

  const sessionId = cleanSessionId(body.sessionId || body.session_id);
  const action: PurchaseAction = body.action === "acknowledge" ? "acknowledge" : "prepare";
  if (!sessionId) {
    return NextResponse.json({ error: "Stripe Checkout Session ID is required." }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  let order: PurchaseOrder | null;
  try {
    order = await loadPurchaseOrder(supabase, sessionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Purchase order lookup failed.";
    console.error("Could not load order for GA4 purchase tracking.", {
      stripeSessionId: sessionId,
      message
    });
    return NextResponse.json({ error: "Purchase order could not be loaded." }, { status: 500 });
  }

  if (!order) {
    return NextResponse.json({ status: "pending", reason: "order_not_ready" });
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2025-02-24.acacia"
  });

  if (action === "acknowledge") {
    const transactionId = cleanTransactionId(body.transactionId || body.transaction_id);
    return acknowledgePurchaseTracking({
      order,
      sessionId,
      transactionId,
      stripe,
      supabase
    });
  }

  return preparePurchasePayload({ order, sessionId, stripe });
}

async function loadPurchaseOrder(supabase: SupabaseServiceClient, sessionId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select(PURCHASE_ORDER_SELECT)
    .eq("stripe_session_id", sessionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as PurchaseOrder | null;
}

async function preparePurchasePayload(input: {
  order: PurchaseOrder;
  sessionId: string;
  stripe: Stripe;
}) {
  const { order, sessionId, stripe } = input;
  const eligibility = getGa4PurchaseEligibility(order);
  if (eligibility.reason === "already_tracked") {
    return NextResponse.json({ status: "duplicate", reason: eligibility.reason });
  }
  if (eligibility.reason === "missing_items") {
    return NextResponse.json({ status: "pending", reason: eligibility.reason });
  }
  if (!eligibility.eligible) {
    return NextResponse.json({ status: "ineligible", reason: eligibility.reason });
  }

  const paymentVerified = await verifyStripePaidSession(stripe, sessionId);
  if (!paymentVerified.ok) {
    if (paymentVerified.error) {
      console.error("Stripe session verification failed for GA4 purchase tracking.", {
        stripeSessionId: sessionId,
        message: paymentVerified.error
      });
    }
    if (paymentVerified.error) {
      return NextResponse.json({ error: "Purchase payment could not be verified." }, { status: 502 });
    }
    return NextResponse.json({ status: "ineligible", reason: "stripe_payment_not_paid" });
  }

  const payload = buildGa4PurchasePayload(order);
  if (!payload) {
    return NextResponse.json({ status: "ineligible", reason: "payload_not_available" });
  }

  return NextResponse.json({ status: "ready", payload });
}

async function acknowledgePurchaseTracking(input: {
  order: PurchaseOrder;
  sessionId: string;
  transactionId: string;
  stripe: Stripe;
  supabase: SupabaseServiceClient;
}) {
  const { order, sessionId, transactionId, stripe, supabase } = input;
  const acknowledgement = getGa4PurchaseAcknowledgementStatus(order, transactionId);
  if (acknowledgement.reason === "already_tracked") {
    return NextResponse.json({ status: "duplicate", reason: acknowledgement.reason });
  }
  if (acknowledgement.reason === "missing_items") {
    return NextResponse.json({ status: "pending", reason: acknowledgement.reason });
  }
  if (!acknowledgement.eligible) {
    return NextResponse.json({ status: "ineligible", reason: acknowledgement.reason });
  }

  const paymentVerified = await verifyStripePaidSession(stripe, sessionId);
  if (!paymentVerified.ok) {
    if (paymentVerified.error) {
      console.error("Stripe session verification failed for GA4 purchase acknowledgement.", {
        orderId: order.id,
        stripeSessionId: sessionId,
        message: paymentVerified.error
      });
    }
    if (paymentVerified.error) {
      return NextResponse.json({ error: "Purchase payment could not be verified." }, { status: 502 });
    }
    return NextResponse.json({ status: "ineligible", reason: "stripe_payment_not_paid" });
  }

  const trackedAt = new Date().toISOString();
  const { data: tracked, error: trackError } = await supabase
    .from("orders")
    .update({
      ga4_purchase_tracked_at: trackedAt,
      ga4_purchase_transaction_id: transactionId
    })
    .eq("id", order.id)
    .eq("stripe_session_id", sessionId)
    .eq("payment_status", "paid")
    .is("ga4_purchase_tracked_at", null)
    .not("order_status", "in", "(cancelled,refunded)")
    .select("id,ga4_purchase_tracked_at,ga4_purchase_transaction_id")
    .maybeSingle();

  if (trackError) {
    if (trackError.code === "23505") {
      return NextResponse.json({ status: "duplicate", reason: "transaction_already_tracked" });
    }

    console.error("Could not acknowledge GA4 purchase tracking for order.", {
      orderId: order.id,
      stripeSessionId: sessionId,
      message: trackError.message
    });
    return NextResponse.json({ error: "Purchase event acknowledgement could not be saved." }, { status: 500 });
  }

  if (!tracked) {
    return NextResponse.json({ status: "duplicate", reason: "already_tracked" });
  }

  return NextResponse.json({
    status: "tracked",
    transactionId,
    trackedAt: tracked.ga4_purchase_tracked_at
  });
}

async function verifyStripePaidSession(stripe: Stripe, sessionId: string) {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return { ok: session.payment_status === "paid", error: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe session could not be verified.";
    return { ok: false, error: message };
  }
}

function originAllowed(request: Request) {
  const originHeader = request.headers.get("origin");
  if (!originHeader) return true;

  try {
    const origin = new URL(originHeader);
    const requestUrl = new URL(request.url);
    const configuredSite = process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : null;
    const checkoutSite = process.env.CHECKOUT_SITE_URL ? new URL(process.env.CHECKOUT_SITE_URL) : null;

    return origin.host === requestUrl.host
      || origin.host === configuredSite?.host
      || origin.host === checkoutSite?.host
      || origin.hostname === "localhost"
      || origin.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function cleanSessionId(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 240) return "";
  return trimmed;
}

function cleanTransactionId(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 120) return "";
  return trimmed;
}
