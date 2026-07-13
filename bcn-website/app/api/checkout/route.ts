import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getCatalogProducts } from "@/lib/catalog-db";
import { getVariationKey, type CartLine, normalizeCartLines } from "@/lib/cart";
import { buildPackagePlan } from "@/lib/shipping/package-builder";
import { evaluateShippingRules, getCheckoutShippingOptions, getPickupBlockMessage, getShippingBlockMessage } from "@/lib/shipping/rules";
import { productToShippingCartItem } from "@/lib/shipping/cart-items";
import { getShippingRuntimeConfig } from "@/lib/shipping/server";
import type { ShippingMethodOption } from "@/lib/shipping/types";

type CheckoutRequest = {
  lines?: CartLine[];
  fulfillment?: "pickup" | "shipping";
  email?: string;
};

function getBaseUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  return new URL(request.url).origin;
}

function toStripeShippingOption(option: ShippingMethodOption) {
  return {
    shipping_rate_data: {
      type: "fixed_amount" as const,
      fixed_amount: { amount: option.amountCents ?? 0, currency: option.currency },
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

export async function POST(request: Request) {
  const body = (await request.json()) as CheckoutRequest;
  const lines = normalizeCartLines(body.lines ?? []);
  let fulfillment = body.fulfillment === "shipping" ? "shipping" : "pickup";

  if (lines.length === 0) {
    return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });
  }

  const products = await getCatalogProducts();
  const checkoutItems = lines.map((line) => {
    const product = products.find((item) => item.id === line.productId);
    if (!product) return null;
    const variant = product.variations?.find((option) => getVariationKey(option) === line.variantKey);
    if (product.variations && product.variations.length > 0 && !variant) return null;
    const inventory = variant?.inventory ?? product.inventory;
    const price = variant?.price ?? product.price;
    const quantity = Math.min(line.quantity, inventory);
    return { product, variant, price, inventory, quantity };
  });

  if (checkoutItems.some((item) => !item || item.quantity <= 0)) {
    return NextResponse.json({ error: "One or more cart items are no longer available." }, { status: 400 });
  }

  let shippingOptions: ReturnType<typeof toStripeShippingOption>[] | undefined;
  let shippingMetadata: Record<string, string> = {};

  try {
    const { packagePresets, settings } = await getShippingRuntimeConfig();
    const shippingItems = checkoutItems.map((item) =>
      productToShippingCartItem(item!.product, item!.quantity, item!.variant ? getVariationKey(item!.variant) : undefined)
    );
    const packagePlan = buildPackagePlan(shippingItems, packagePresets, settings);
    const subtotalCents = checkoutItems.reduce((sum, item) => sum + Math.round(item!.price * 100) * item!.quantity, 0);
    const shippingRules = evaluateShippingRules(shippingItems, packagePlan, settings, subtotalCents);

    if (shippingRules.digitalOnly) {
      fulfillment = "pickup";
      shippingMetadata = {
        shipping_method_code: "digital_delivery",
        shipping_provider: "digital_delivery",
        package_count: "0"
      };
    } else if (fulfillment === "pickup") {
      const pickupError = getPickupBlockMessage(shippingRules);
      if (pickupError) {
        return NextResponse.json({ error: pickupError }, { status: 400 });
      }
      shippingMetadata = {
        shipping_method_code: "local_pickup",
        shipping_provider: "local_pickup",
        package_count: "0"
      };
    } else {
      const checkoutShippingOptions = getCheckoutShippingOptions(shippingRules);
      if (checkoutShippingOptions.length === 0) {
        return NextResponse.json({ error: getShippingBlockMessage(shippingRules) }, { status: 400 });
      }
      shippingOptions = checkoutShippingOptions.map(toStripeShippingOption);
      shippingMetadata = {
        shipping_method_codes: checkoutShippingOptions.map((option) => option.methodCode).join(","),
        shipping_provider: checkoutShippingOptions.map((option) => option.provider).join(","),
        package_count: String(packagePlan.packages.length)
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shipping rules could not be loaded.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return NextResponse.json({ error: "Stripe is not configured yet." }, { status: 500 });
  }

  const baseUrl = getBaseUrl(request);
  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2025-02-24.acacia"
  });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: body.email || undefined,
    automatic_tax: { enabled: true },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    shipping_address_collection: fulfillment === "shipping" ? { allowed_countries: ["US"] } : undefined,
    shipping_options: shippingOptions,
    line_items: checkoutItems.map((item) => ({
      quantity: item!.quantity,
      price_data: {
        currency: "usd",
        unit_amount: Math.round(item!.price * 100),
        product_data: {
          name: item!.variant ? `${item!.product.name} - ${item!.variant.name}` : item!.product.name,
          description: item!.product.scientificName || item!.product.category,
          images: item!.product.images.filter((image) => image.startsWith("https://")).slice(0, 1),
          metadata: {
            product_id: item!.product.id,
            slug: item!.product.slug,
            variant: item!.variant ? getVariationKey(item!.variant) : ""
          }
        },
        tax_behavior: "exclusive"
      }
    })),
    metadata: {
      fulfillment,
      source: "bcn-website",
      product_ids: checkoutItems.map((item) => item!.product.id).join(","),
      ...shippingMetadata
    },
    success_url: `${baseUrl}/cart/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/cart`
  });

  return NextResponse.json({ url: session.url });
}
