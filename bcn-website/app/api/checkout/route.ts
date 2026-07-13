import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getVariationKey, type CartLine } from "@/lib/cart";
import { getSupabaseServiceClient } from "@/lib/supabase-service";
import { buildPackagePlan } from "@/lib/shipping/package-builder";
import { CheckoutCartError, buildCheckoutCart, type CheckoutCart } from "@/lib/shipping/checkout-cart";
import { getShippingRuntimeConfig } from "@/lib/shipping/server";
import { buildShippingQuoteDraft, ShippingQuoteError } from "@/lib/shipping/quote-builder";
import { createShippingQuoteFingerprint } from "@/lib/shipping/fingerprint";
import { normalizeShippingAddress, shippingAddressEquals, type ShippingAddressInput } from "@/lib/shipping/address";
import type { ShippingPackagePreset, ShippingQuoteOption, ShippingQuoteRecord, ShippingSettings } from "@/lib/shipping/types";

export const runtime = "nodejs";

type CheckoutRequest = {
  lines?: CartLine[];
  fulfillment?: "pickup" | "shipping";
  email?: string;
  shippingQuoteId?: string;
  selectedShippingOptionId?: string;
  destinationAddress?: ShippingAddressInput;
  untrackedShippingAcknowledged?: boolean;
};

type RuntimeConfig = {
  packagePresets: ShippingPackagePreset[];
  settings: ShippingSettings;
};

function getBaseUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  return new URL(request.url).origin;
}

function metadataValue(value: unknown) {
  return String(value ?? "").slice(0, 500);
}

function toStripeShippingOption(option: ShippingQuoteOption) {
  return {
    shipping_rate_data: {
      type: "fixed_amount" as const,
      fixed_amount: { amount: option.amountCents, currency: option.currency },
      display_name: option.displayName,
      metadata: {
        bcn_method_code: option.methodCode,
        bcn_provider: option.provider,
        bcn_rate_mode: option.rateMode,
        bcn_package_count: String(option.packageCount)
      }
    }
  };
}

function metadataFromQuoteOption(option: ShippingQuoteOption, quote?: ShippingQuoteRecord | null) {
  return {
    shipping_quote_id: metadataValue(quote?.id),
    shipping_method_code: metadataValue(option.methodCode),
    shipping_method_name: metadataValue(option.displayName),
    shipping_provider: metadataValue(option.provider),
    shipping_carrier: metadataValue(option.carrier),
    shipping_service: metadataValue(option.serviceName),
    shipping_amount_cents: metadataValue(option.amountCents),
    address_validation_status: metadataValue(quote?.address_validation_status),
    untracked_shipping_acknowledged: metadataValue(quote?.untracked_shipping_acknowledged),
    package_count: metadataValue(option.packageCount)
  };
}

function parseQuoteOptions(row: ShippingQuoteRecord) {
  return Array.isArray(row.available_options) ? row.available_options : [];
}

async function reserveShippingQuote(input: {
  body: CheckoutRequest;
  cart: CheckoutCart;
  runtimeConfig: RuntimeConfig;
}) {
  if (!input.body.shippingQuoteId || !input.body.selectedShippingOptionId) {
    throw new ShippingQuoteError("Get a shipping quote and choose a shipping option before checkout.");
  }

  const requestedAddress = normalizeShippingAddress(input.body.destinationAddress);
  const supabase = getSupabaseServiceClient();
  const { data: row, error } = await supabase
    .from("shipping_quotes")
    .select("*")
    .eq("id", input.body.shippingQuoteId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load shipping quote: ${error.message}`);
  }

  if (!row) {
    throw new ShippingQuoteError("Shipping quote was not found. Please get a new quote.");
  }

  const quote = row as ShippingQuoteRecord;
  if (quote.quote_status !== "open" || quote.used_at || quote.stripe_session_id) {
    throw new ShippingQuoteError("Shipping quote has already been used. Please get a new quote.");
  }

  if (new Date(quote.expires_at).getTime() <= Date.now()) {
    throw new ShippingQuoteError("Shipping quote expired. Please get a new quote.");
  }

  if (!shippingAddressEquals(requestedAddress, quote.destination_address as ShippingAddressInput)) {
    throw new ShippingQuoteError("Shipping address changed after the quote was created. Please get a new quote.");
  }

  const packagePlan = buildPackagePlan(input.cart.shippingItems, input.runtimeConfig.packagePresets, input.runtimeConfig.settings);
  const fingerprint = createShippingQuoteFingerprint({
    shippingItems: input.cart.shippingItems,
    packagePlan,
    destinationAddress: normalizeShippingAddress(quote.destination_address as ShippingAddressInput)
  });

  if (fingerprint !== quote.cart_fingerprint) {
    throw new ShippingQuoteError("Cart changed after the shipping quote was created. Please get a new quote.");
  }

  const selectedOption = parseQuoteOptions(quote).find((option) => option.id === input.body.selectedShippingOptionId);
  if (!selectedOption) {
    throw new ShippingQuoteError("Selected shipping option is no longer available. Please get a new quote.");
  }

  if (selectedOption.requiresUntrackedAcknowledgement && !input.body.untrackedShippingAcknowledged) {
    throw new ShippingQuoteError("Please acknowledge that Economy Seed Mail does not include tracking.");
  }

  const { data: reserved, error: reserveError } = await supabase
    .from("shipping_quotes")
    .update({
      selected_option_id: selectedOption.id,
      selected_option: selectedOption,
      quote_status: "reserved",
      reserved_at: new Date().toISOString(),
      used_at: null,
      untracked_shipping_acknowledged: Boolean(input.body.untrackedShippingAcknowledged)
    })
    .eq("id", quote.id)
    .eq("quote_status", "open")
    .is("used_at", null)
    .is("stripe_session_id", null)
    .select("*")
    .single();

  if (reserveError || !reserved) {
    throw new ShippingQuoteError("Shipping quote could not be reserved. Please get a new quote.");
  }

  return {
    quote: reserved as ShippingQuoteRecord,
    option: selectedOption
  };
}

async function releaseReservedShippingQuote(quoteId: string) {
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from("shipping_quotes")
    .update({
      selected_option_id: null,
      selected_option: null,
      quote_status: "open",
      reserved_at: null,
      used_at: null,
      untracked_shipping_acknowledged: false
    })
    .eq("id", quoteId)
    .eq("quote_status", "reserved")
    .is("stripe_session_id", null);

  if (error) {
    console.error("Shipping quote reservation could not be released.", { quoteId, error });
  }
}

async function attachStripeSessionToQuote(quoteId: string, stripeSessionId: string) {
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from("shipping_quotes")
    .update({ stripe_session_id: stripeSessionId })
    .eq("id", quoteId)
    .eq("quote_status", "reserved");

  if (error) {
    console.error("Shipping quote could not be linked to Stripe session.", {
      quoteId,
      stripeSessionId,
      error
    });
  }
}

async function getPickupOrDigitalOption(input: {
  cart: CheckoutCart;
  fulfillment: "pickup" | "shipping";
  email?: string;
  runtimeConfig: RuntimeConfig;
}) {
  const draft = await buildShippingQuoteDraft({
    cart: input.cart,
    fulfillment: input.fulfillment,
    email: input.email,
    packagePresets: input.runtimeConfig.packagePresets,
    settings: input.runtimeConfig.settings
  });

  const option = draft.availableOptions[0];
  if (!option) throw new ShippingQuoteError("No checkout option is available for this cart.");
  return option;
}

export async function POST(request: Request) {
  let body: CheckoutRequest;
  try {
    body = (await request.json()) as CheckoutRequest;
  } catch {
    return NextResponse.json({ error: "Checkout request was not valid JSON." }, { status: 400 });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return NextResponse.json({ error: "Stripe is not configured yet." }, { status: 500 });
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2025-02-24.acacia"
  });

  let cart: CheckoutCart;
  let runtimeConfig: RuntimeConfig;
  let fulfillment: "pickup" | "shipping" = body.fulfillment === "shipping" ? "shipping" : "pickup";
  let shippingOptions: ReturnType<typeof toStripeShippingOption>[] | undefined;
  let shippingMetadata: Record<string, string> = {};
  let reservedShippingQuoteId: string | null = null;

  try {
    [cart, runtimeConfig] = await Promise.all([
      buildCheckoutCart(body.lines ?? []),
      getShippingRuntimeConfig()
    ]);

    if (fulfillment === "shipping") {
      const reserved = await reserveShippingQuote({ body, cart, runtimeConfig });
      reservedShippingQuoteId = reserved.quote.id;
      shippingOptions = [toStripeShippingOption(reserved.option)];
      shippingMetadata = metadataFromQuoteOption(reserved.option, reserved.quote);
    } else {
      const option = await getPickupOrDigitalOption({
        cart,
        fulfillment,
        email: body.email,
        runtimeConfig
      });
      fulfillment = option.methodCode === "digital_delivery" ? "pickup" : fulfillment;
      shippingMetadata = metadataFromQuoteOption(option);
    }
  } catch (error) {
    if (error instanceof CheckoutCartError || error instanceof ShippingQuoteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (reservedShippingQuoteId) {
      await releaseReservedShippingQuote(reservedShippingQuoteId);
    }
    const message = error instanceof Error ? error.message : "Shipping rules could not be loaded.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const baseUrl = getBaseUrl(request);

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: body.email || undefined,
      automatic_tax: { enabled: true },
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      shipping_address_collection: fulfillment === "shipping" ? { allowed_countries: ["US"] } : undefined,
      shipping_options: shippingOptions,
      line_items: cart.items.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(item.price * 100),
          product_data: {
            name: item.variant ? `${item.product.name} - ${item.variant.name}` : item.product.name,
            description: item.product.scientificName || item.product.category,
            images: item.product.images.filter((image) => image.startsWith("https://")).slice(0, 1),
            metadata: {
              product_id: item.product.id,
              slug: item.product.slug,
              variant: item.variant ? getVariationKey(item.variant) : ""
            }
          },
          tax_behavior: "exclusive"
        }
      })),
      metadata: {
        fulfillment,
        source: "bcn-website",
        product_ids: cart.items.map((item) => item.product.id).join(","),
        ...shippingMetadata
      },
      success_url: `${baseUrl}/cart/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cart`
    });
  } catch (error) {
    if (reservedShippingQuoteId) {
      await releaseReservedShippingQuote(reservedShippingQuoteId);
    }
    const message = error instanceof Error ? error.message : "Stripe Checkout could not be created.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (reservedShippingQuoteId) {
    await attachStripeSessionToQuote(reservedShippingQuoteId, session.id);
  }

  return NextResponse.json({ url: session.url });
}
