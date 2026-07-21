"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { trackShopAnalyticsEvent } from "@/lib/analytics/shop-analytics";
import { CART_STORAGE_KEY, type CartLine, type CartProduct, formatMoney, getVariationKey, normalizeCartLines, pruneCartLinesForProducts } from "@/lib/cart";
import { productToGoogleAnalyticsItem, trackGoogleEvent } from "@/lib/marketing/google-analytics";
import { getPrimaryProductImage } from "@/lib/product-images";

type CartClientProps = {
  products: CartProduct[];
};

type Fulfillment = "pickup" | "shipping";
type EnrichedCartLine = CartLine & {
  product: CartProduct;
  variant?: NonNullable<CartProduct["variations"]>[number];
  unitPrice: number;
  maxInventory: number;
};

type ShippingAddressForm = {
  name: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
};

type ShippingQuoteOption = {
  id: string;
  methodCode: string;
  displayName: string;
  amountCents: number;
  currency: "usd";
  provider: string;
  carrier?: string;
  serviceName?: string;
  trackingIncluded: boolean;
  packageCount: number;
  warningText?: string;
  requiresUntrackedAcknowledgement?: boolean;
  estimatedDays?: number | null;
  durationTerms?: string;
};

type ShippingQuoteResponse = {
  quoteId: string;
  expiresAt: string;
  addressValidationStatus: string;
  validatedAddress: Record<string, unknown>;
  options: ShippingQuoteOption[];
  messages: string[];
};

const EMPTY_SHIPPING_ADDRESS: ShippingAddressForm = {
  name: "",
  street1: "",
  street2: "",
  city: "",
  state: "",
  zip: "",
  phone: ""
};

function getLineKey(line: Pick<CartLine, "productId" | "variantKey">) {
  return `${line.productId}::${line.variantKey ?? ""}`;
}

function optionDetail(option: ShippingQuoteOption) {
  const parts = [
    option.trackingIncluded ? "Tracking included" : "No tracking",
    option.estimatedDays ? `${option.estimatedDays} business day${option.estimatedDays === 1 ? "" : "s"}` : "",
    option.packageCount > 1 ? `${option.packageCount} packages` : ""
  ].filter(Boolean);

  return parts.join(" / ");
}

export function CartClient({ products }: CartClientProps) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("pickup");
  const [email, setEmail] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [shippingAddress, setShippingAddress] = useState<ShippingAddressForm>(EMPTY_SHIPPING_ADDRESS);
  const [quote, setQuote] = useState<ShippingQuoteResponse | null>(null);
  const [selectedShippingOptionId, setSelectedShippingOptionId] = useState("");
  const [untrackedAcknowledged, setUntrackedAcknowledged] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CART_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setLines(pruneCartLinesForProducts(parsed, products));
    } catch {
      setLines([]);
    }
  }, [products]);

  useEffect(() => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
    window.dispatchEvent(new CustomEvent("bcn-cart-updated"));
  }, [lines]);

  const enriched = useMemo(() => {
    return lines
      .map((line) => {
        const product = products.find((item) => item.id === line.productId);
        if (!product) return null;
        const variant = product.variations?.find((option) => getVariationKey(option) === line.variantKey);
        const maxInventory = Math.max(variant?.inventory ?? product.inventory, 0);
        const quantity = Math.max(1, Math.min(line.quantity, Math.max(maxInventory, 1)));
        const unitPrice = variant?.price ?? product.price;
        return { ...line, quantity, product, variant, unitPrice, maxInventory };
      })
      .filter(Boolean) as EnrichedCartLine[];
  }, [lines, products]);

  const normalizedLinesKey = useMemo(() => JSON.stringify(normalizeCartLines(lines)), [lines]);
  const shippingAddressKey = useMemo(() => JSON.stringify(shippingAddress), [shippingAddress]);

  useEffect(() => {
    setQuote(null);
    setSelectedShippingOptionId("");
    setUntrackedAcknowledged(false);
  }, [normalizedLinesKey, fulfillment, shippingAddressKey]);

  const subtotal = enriched.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const digitalOnly = enriched.every((line) => line.product.shippingClass === "digital");
  const hasSeedEnvelopeItems = enriched.some((line) => line.product.shippingClass === "seed_envelope");
  const hasShippingBlockedItems = enriched.some((line) => line.product.shippingClass !== "digital" && !(line.product.shippingEnabled ?? line.product.ships));
  const hasPickupBlockedItems = enriched.some((line) => line.product.shippingClass !== "digital" && !(line.product.localPickupEnabled ?? line.product.localPickup));
  const hasShippingSetupMissing = enriched.some((line) =>
    line.product.shippingClass !== "digital"
    && (line.product.shippingEnabled ?? line.product.ships)
    && !line.product.shippingConfigurationComplete
  );
  const selectedShippingOption = quote?.options.find((option) => option.id === selectedShippingOptionId) ?? null;
  const addressComplete = Boolean(shippingAddress.street1.trim() && shippingAddress.city.trim() && shippingAddress.state.trim() && shippingAddress.zip.trim());
  const fulfillmentAllowed = fulfillment === "pickup"
    ? (digitalOnly || !hasPickupBlockedItems)
    : (!digitalOnly && !hasShippingBlockedItems && !hasShippingSetupMissing);
  const shippingReady = fulfillment !== "shipping"
    || Boolean(selectedShippingOption && (!selectedShippingOption.requiresUntrackedAcknowledgement || untrackedAcknowledged));
  const canRequestQuote = enriched.length > 0
    && fulfillment === "shipping"
    && fulfillmentAllowed
    && addressComplete
    && !quoteLoading;
  const canCheckout = enriched.length > 0
    && fulfillmentAllowed
    && shippingReady
    && !checkingOut
    && !quoteLoading;
  const shippingAmount = selectedShippingOption ? selectedShippingOption.amountCents / 100 : 0;

  function updateQuantity(target: CartLine, quantity: number) {
    const targetKey = getLineKey(target);
    setLines((current) =>
      normalizeCartLines(
        current.map((line) =>
          getLineKey(line) === targetKey ? { ...line, quantity } : line
        )
      )
    );
  }

  function removeLine(target: CartLine) {
    const targetKey = getLineKey(target);
    setLines((current) => current.filter((line) => getLineKey(line) !== targetKey));
  }

  function updateAddress(field: keyof ShippingAddressForm, value: string) {
    setShippingAddress((current) => ({ ...current, [field]: value }));
  }

  function fulfillmentLabel(product: CartProduct) {
    if (product.shippingClass === "digital") return "Digital delivery";
    const ships = product.shippingEnabled ?? product.ships;
    const pickup = product.localPickupEnabled ?? product.localPickup;
    if (ships && pickup) return product.shippingConfigurationComplete ? "Ships or pickup" : "Shipping setup pending";
    if (ships) return product.shippingConfigurationComplete ? "Ships" : "Shipping setup pending";
    if (pickup) return "Pickup only";
    return "Fulfillment setup pending";
  }

  async function requestShippingQuote() {
    setQuoteLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/shipping/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines,
          fulfillment,
          email,
          destinationAddress: {
            name: shippingAddress.name,
            street1: shippingAddress.street1,
            street2: shippingAddress.street2,
            city: shippingAddress.city,
            state: shippingAddress.state,
            zip: shippingAddress.zip,
            country: "US",
            phone: shippingAddress.phone,
            email
          }
        })
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error ?? "Shipping quote could not be created.");
        return;
      }

      setQuote(data);
      setSelectedShippingOptionId(data.options?.[0]?.id ?? "");
      setUntrackedAcknowledged(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Shipping quote could not be created.");
    } finally {
      setQuoteLoading(false);
    }
  }

  async function checkout() {
    if (fulfillment === "shipping" && !selectedShippingOption) {
      setMessage("Choose a shipping option before checkout.");
      return;
    }

    setCheckingOut(true);
    setMessage("");
    trackGoogleEvent("begin_checkout", {
      currency: "USD",
      value: subtotal + shippingAmount,
      shipping: shippingAmount,
      items: enriched.map((line) => productToGoogleAnalyticsItem(line.product, line.variant, line.quantity))
    });
    trackShopAnalyticsEvent("begin_checkout", {
      valueCents: Math.round((subtotal + shippingAmount) * 100),
      currency: "usd",
      metadata: {
        fulfillment,
        line_count: enriched.length,
        item_count: enriched.reduce((sum, line) => sum + line.quantity, 0),
        shipping_cents: Math.round(shippingAmount * 100)
      }
    });

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines,
          fulfillment,
          email,
          shippingQuoteId: quote?.quoteId,
          selectedShippingOptionId,
          destinationAddress: {
            name: shippingAddress.name,
            street1: shippingAddress.street1,
            street2: shippingAddress.street2,
            city: shippingAddress.city,
            state: shippingAddress.state,
            zip: shippingAddress.zip,
            country: "US",
            phone: shippingAddress.phone,
            email
          },
          untrackedShippingAcknowledged: untrackedAcknowledged
        })
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error ?? "Checkout could not start.");
        return;
      }

      window.location.href = data.url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout could not start.");
    } finally {
      setCheckingOut(false);
    }
  }

  if (enriched.length === 0) {
    return (
      <section className="field-card max-w-3xl p-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-stone">Cart</p>
        <h1 className="mt-3 text-5xl font-black text-pine">Shopping cart</h1>
        <p className="mt-5 text-lg leading-8 text-ink/75">Your cart is empty. Add plants, cuttings, or seeds from the shop.</p>
        <a className="button button-primary mt-6" href="/shop">Back to shop</a>
      </section>
    );
  }

  return (
    <section className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="field-card p-5 md:p-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-stone">Cart</p>
        <h1 className="mt-3 text-5xl font-black text-pine">Shopping cart</h1>
        <div className="mt-8 grid gap-5">
          {enriched.map((line) => {
            const primaryImage = getPrimaryProductImage(line.product);
            return (
              <article key={getLineKey(line)} className="grid gap-4 rounded-md bg-sage/45 p-4 md:grid-cols-[120px_1fr_auto]">
                <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-sage">
                  <Image
                    src={primaryImage.url}
                    alt={primaryImage.altText}
                    fill
                    className="object-cover"
                    sizes="120px"
                  />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-pine">{line.product.name}</h2>
                  {line.variant ? (
                    <p className="mt-1 text-sm font-black text-rust">{line.variant.name}</p>
                  ) : null}
                  <p className="mt-1 text-sm font-bold text-stone">{fulfillmentLabel(line.product)}</p>
                  <p className="mt-3 font-black text-pine">{formatMoney(line.unitPrice)}</p>
                </div>
                <div className="flex items-center gap-3 md:flex-col md:items-end">
                  <input
                    className="admin-input w-24"
                    min={1}
                    max={line.maxInventory}
                    type="number"
                    value={line.quantity}
                    onChange={(event) => updateQuantity(line, Number(event.target.value))}
                  />
                  <button className="font-black text-rust" type="button" onClick={() => removeLine(line)}>
                    Remove
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <aside className="field-card h-fit p-6">
        <h2 className="text-2xl font-black text-pine">Checkout</h2>
        <div className="mt-5 grid gap-3">
          <button
            className={`button ${fulfillment === "pickup" ? "button-primary" : "button-secondary"}`}
            type="button"
            onClick={() => {
              setFulfillment("pickup");
              setMessage("");
            }}
          >
            Local pickup
          </button>
          <button
            className={`button ${fulfillment === "shipping" ? "button-primary" : "button-secondary"}`}
            type="button"
            disabled={digitalOnly}
            onClick={() => {
              setFulfillment("shipping");
              setMessage("");
            }}
          >
            Ship eligible items
          </button>
        </div>
        {fulfillment === "shipping" && hasShippingBlockedItems ? (
          <p className="mt-4 rounded-md bg-rust/10 p-3 text-sm font-bold text-rust">
            Your cart includes pickup-only items. Remove them or choose local pickup.
          </p>
        ) : null}
        {fulfillment === "shipping" && hasShippingSetupMissing ? (
          <p className="mt-4 rounded-md bg-rust/10 p-3 text-sm font-bold text-rust">
            One or more products need shipping setup before they can be shipped.
          </p>
        ) : null}
        {fulfillment === "pickup" && hasPickupBlockedItems ? (
          <p className="mt-4 rounded-md bg-rust/10 p-3 text-sm font-bold text-rust">
            Your cart includes an item that is not eligible for local pickup.
          </p>
        ) : null}
        {digitalOnly ? (
          <p className="mt-4 rounded-md bg-sage/60 p-3 text-sm font-bold text-stone">
            Digital-only carts do not need shipping or pickup.
          </p>
        ) : null}
        {fulfillment === "shipping" && hasSeedEnvelopeItems ? (
          <p className="mt-4 rounded-md bg-sage/60 p-3 text-sm font-bold text-stone">
            Seed-only carts under the envelope limit can use $2 Economy Seed Mail without tracking. Tracked USPS options are shown with live rates.
          </p>
        ) : null}
        <label className="mt-5 block">
          <span className="text-sm font-black text-pine">Email for order updates</span>
          <input
            autoComplete="email"
            className="admin-input mt-2"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        {fulfillment === "shipping" ? (
          <div className="mt-5 grid gap-3">
            <label className="block">
              <span className="text-sm font-black text-pine">Ship to name</span>
              <input
                autoComplete="shipping name"
                className="admin-input mt-2"
                name="shipping-name"
                value={shippingAddress.name}
                onChange={(event) => updateAddress("name", event.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-sm font-black text-pine">Street address</span>
              <input
                autoComplete="shipping address-line1"
                className="admin-input mt-2"
                name="shipping-address-line1"
                value={shippingAddress.street1}
                onChange={(event) => updateAddress("street1", event.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-sm font-black text-pine">Apartment, suite, or unit</span>
              <input
                autoComplete="shipping address-line2"
                className="admin-input mt-2"
                name="shipping-address-line2"
                value={shippingAddress.street2}
                onChange={(event) => updateAddress("street2", event.target.value)}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-[1fr_82px_112px]">
              <label className="block">
                <span className="text-sm font-black text-pine">City</span>
                <input
                  autoComplete="shipping address-level2"
                  className="admin-input mt-2"
                  name="shipping-address-level2"
                  value={shippingAddress.city}
                  onChange={(event) => updateAddress("city", event.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-sm font-black text-pine">State</span>
                <input
                  autoComplete="shipping address-level1"
                  className="admin-input mt-2 uppercase"
                  maxLength={2}
                  name="shipping-address-level1"
                  value={shippingAddress.state}
                  onChange={(event) => updateAddress("state", event.target.value.toUpperCase())}
                />
              </label>
              <label className="block">
                <span className="text-sm font-black text-pine">ZIP</span>
                <input
                  autoComplete="shipping postal-code"
                  className="admin-input mt-2"
                  inputMode="numeric"
                  name="shipping-postal-code"
                  value={shippingAddress.zip}
                  onChange={(event) => updateAddress("zip", event.target.value)}
                />
              </label>
            </div>
            <label className="block">
              <span className="text-sm font-black text-pine">Phone</span>
              <input
                autoComplete="shipping tel"
                className="admin-input mt-2"
                name="shipping-tel"
                type="tel"
                value={shippingAddress.phone}
                onChange={(event) => updateAddress("phone", event.target.value)}
              />
            </label>
            <button className="button button-secondary w-full" type="button" disabled={!canRequestQuote} onClick={requestShippingQuote}>
              {quoteLoading ? "Getting options..." : "Get shipping options"}
            </button>

            {quote?.messages?.length ? (
              <div className="rounded-md bg-sage/60 p-3 text-sm font-bold text-stone">
                {quote.messages.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            ) : null}

            {quote?.options?.length ? (
              <div className="grid gap-3">
                {quote.options.map((option) => (
                  <label
                    key={option.id}
                    className={`cursor-pointer rounded-md border p-3 ${selectedShippingOptionId === option.id ? "border-rust bg-rust/10" : "border-pine/15 bg-white/70"}`}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name="shipping-option"
                      checked={selectedShippingOptionId === option.id}
                      onChange={() => {
                        setSelectedShippingOptionId(option.id);
                        setUntrackedAcknowledged(false);
                      }}
                    />
                    <span className="flex items-start justify-between gap-3">
                      <span>
                        <span className="block font-black text-pine">{option.displayName}</span>
                        <span className="mt-1 block text-xs font-bold uppercase tracking-[0.16em] text-stone">{optionDetail(option)}</span>
                      </span>
                      <span className="font-black text-pine">{formatMoney(option.amountCents / 100)}</span>
                    </span>
                    {option.warningText ? <span className="mt-2 block text-sm font-bold text-rust">{option.warningText}</span> : null}
                  </label>
                ))}
              </div>
            ) : null}

            {selectedShippingOption?.requiresUntrackedAcknowledgement ? (
              <label className="flex items-start gap-3 rounded-md bg-rust/10 p-3 text-sm font-bold text-rust">
                <input className="mt-1" type="checkbox" checked={untrackedAcknowledged} onChange={(event) => setUntrackedAcknowledged(event.target.checked)} />
                <span>I understand this shipping method does not include tracking.</span>
              </label>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 rounded-md bg-sage/55 p-5">
          <div className="flex items-center justify-between">
            <span className="font-bold">Subtotal</span>
            <span className="font-black">{formatMoney(subtotal)}</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-stone">
            <span>Shipping</span>
            <span>{digitalOnly ? "Not needed" : fulfillment === "pickup" ? "Free pickup" : selectedShippingOption ? formatMoney(shippingAmount) : "Get quote"}</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-stone">
            <span>Tax</span>
            <span>Calculated in Stripe</span>
          </div>
          {selectedShippingOption ? (
            <div className="mt-3 flex items-center justify-between border-t border-pine/10 pt-3 text-pine">
              <span className="font-black">Before tax</span>
              <span className="font-black">{formatMoney(subtotal + shippingAmount)}</span>
            </div>
          ) : null}
        </div>
        {message ? <p className="mt-4 rounded-md bg-rust/10 p-3 text-sm font-bold text-rust">{message}</p> : null}
        <button className="button button-primary mt-6 w-full" type="button" disabled={!canCheckout} onClick={checkout}>
          {checkingOut ? "Starting checkout..." : "Checkout with Stripe"}
        </button>
      </aside>
    </section>
  );
}
