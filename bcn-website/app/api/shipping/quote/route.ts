import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase-service";
import { type CartLine } from "@/lib/cart";
import { buildCheckoutCart, CheckoutCartError } from "@/lib/shipping/checkout-cart";
import { getShippingRuntimeConfig } from "@/lib/shipping/server";
import { buildShippingQuoteDraft, ShippingQuoteError } from "@/lib/shipping/quote-builder";
import type { ShippingAddressInput } from "@/lib/shipping/address";
import type { ShippingQuoteOption } from "@/lib/shipping/types";

export const runtime = "nodejs";

type QuoteRequest = {
  lines?: CartLine[];
  fulfillment?: "pickup" | "shipping";
  email?: string;
  destinationAddress?: ShippingAddressInput;
};

function publicOption(option: ShippingQuoteOption) {
  return {
    id: option.id,
    methodCode: option.methodCode,
    displayName: option.displayName,
    amountCents: option.amountCents,
    currency: option.currency,
    provider: option.provider,
    carrier: option.carrier,
    serviceName: option.serviceName,
    trackingIncluded: option.trackingIncluded,
    packageCount: option.packageCount,
    warningText: option.warningText,
    requiresUntrackedAcknowledgement: option.requiresUntrackedAcknowledgement,
    estimatedDays: option.estimatedDays,
    durationTerms: option.durationTerms
  };
}

export async function POST(request: Request) {
  let body: QuoteRequest;
  try {
    body = (await request.json()) as QuoteRequest;
  } catch {
    return NextResponse.json({ error: "Quote request was not valid JSON." }, { status: 400 });
  }

  try {
    const [cart, runtimeConfig] = await Promise.all([
      buildCheckoutCart(body.lines ?? []),
      getShippingRuntimeConfig()
    ]);

    const draft = await buildShippingQuoteDraft({
      cart,
      fulfillment: body.fulfillment === "shipping" ? "shipping" : "pickup",
      destinationAddress: body.destinationAddress,
      email: body.email,
      packagePresets: runtimeConfig.packagePresets,
      settings: runtimeConfig.settings
    });

    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("shipping_quotes")
      .insert({
        cart_fingerprint: draft.cartFingerprint,
        customer_email: draft.customerEmail,
        destination_address: draft.destinationAddress,
        validated_address: draft.validatedAddress,
        address_validation_status: draft.addressValidationStatus,
        package_plan: draft.packagePlan,
        available_options: draft.availableOptions,
        provider: draft.provider,
        expires_at: draft.expiresAt
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Could not save shipping quote: ${error.message}`);
    }

    return NextResponse.json({
      quoteId: data.id,
      expiresAt: draft.expiresAt,
      addressValidationStatus: draft.addressValidationStatus,
      validatedAddress: draft.validatedAddress,
      options: draft.availableOptions.map(publicOption),
      messages: draft.messages
    });
  } catch (error) {
    if (error instanceof CheckoutCartError || error instanceof ShippingQuoteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Shipping quote could not be created.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
