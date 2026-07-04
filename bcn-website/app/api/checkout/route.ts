import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getCatalogProducts } from "@/lib/catalog-db";
import { getVariationKey, type CartLine, normalizeCartLines } from "@/lib/cart";

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

export async function POST(request: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return NextResponse.json({ error: "Stripe is not configured yet." }, { status: 500 });
  }

  const body = (await request.json()) as CheckoutRequest;
  const lines = normalizeCartLines(body.lines ?? []);
  const fulfillment = body.fulfillment === "shipping" ? "shipping" : "pickup";

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

  if (fulfillment === "shipping" && checkoutItems.some((item) => item && !item.product.ships)) {
    return NextResponse.json({ error: "Your cart includes pickup-only items." }, { status: 400 });
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
    shipping_options: fulfillment === "shipping"
      ? [
          {
            shipping_rate_data: {
              type: "fixed_amount",
              fixed_amount: { amount: 900, currency: "usd" },
              display_name: "Standard shipping",
              delivery_estimate: {
                minimum: { unit: "business_day", value: 3 },
                maximum: { unit: "business_day", value: 7 }
              }
            }
          }
        ]
      : undefined,
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
      product_ids: checkoutItems.map((item) => item!.product.id).join(",")
    },
    success_url: `${baseUrl}/cart/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/cart`
  });

  return NextResponse.json({ url: session.url });
}
