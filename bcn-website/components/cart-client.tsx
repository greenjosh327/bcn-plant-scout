"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { CART_STORAGE_KEY, type CartLine, type CartProduct, formatMoney, getVariationKey, normalizeCartLines } from "@/lib/cart";

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

export function CartClient({ products }: CartClientProps) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("pickup");
  const [email, setEmail] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CART_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setLines(normalizeCartLines(parsed));
    } catch {
      setLines([]);
    }
  }, []);

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

  const subtotal = enriched.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const hasPickupOnlyItems = enriched.some((line) => !line.product.ships);
  const canCheckout = enriched.length > 0 && !checkingOut && !(fulfillment === "shipping" && hasPickupOnlyItems);

  function getLineKey(line: Pick<CartLine, "productId" | "variantKey">) {
    return `${line.productId}::${line.variantKey ?? ""}`;
  }

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

  async function checkout() {
    setCheckingOut(true);
    setMessage("");

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines, fulfillment, email })
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
          {enriched.map((line) => (
            <article key={getLineKey(line)} className="grid gap-4 rounded-md bg-sage/45 p-4 md:grid-cols-[120px_1fr_auto]">
              <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-sage">
                <Image src={line.product.images[0]} alt={line.product.name} fill className="object-cover" sizes="120px" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-pine">{line.product.name}</h2>
                {line.variant ? (
                  <p className="mt-1 text-sm font-black text-rust">{line.variant.name}</p>
                ) : null}
                <p className="mt-1 text-sm font-bold text-stone">{line.product.ships ? "Ships or pickup" : "Pickup only"}</p>
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
          ))}
        </div>
      </div>

      <aside className="field-card h-fit p-6">
        <h2 className="text-2xl font-black text-pine">Checkout</h2>
        <div className="mt-5 grid gap-3">
          <button
            className={`button ${fulfillment === "pickup" ? "button-primary" : "button-secondary"}`}
            type="button"
            onClick={() => setFulfillment("pickup")}
          >
            Local pickup
          </button>
          <button
            className={`button ${fulfillment === "shipping" ? "button-primary" : "button-secondary"}`}
            type="button"
            onClick={() => setFulfillment("shipping")}
          >
            Ship eligible items
          </button>
        </div>
        {fulfillment === "shipping" && hasPickupOnlyItems ? (
          <p className="mt-4 rounded-md bg-rust/10 p-3 text-sm font-bold text-rust">
            Your cart includes pickup-only items. Remove them or choose local pickup.
          </p>
        ) : null}
        <label className="mt-5 block">
          <span className="text-sm font-black text-pine">Email for order updates</span>
          <input className="admin-input mt-2" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <div className="mt-6 rounded-md bg-sage/55 p-5">
          <div className="flex items-center justify-between">
            <span className="font-bold">Subtotal</span>
            <span className="font-black">{formatMoney(subtotal)}</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-stone">
            <span>Shipping</span>
            <span>{fulfillment === "pickup" ? "Free pickup" : "Calculated in Stripe"}</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-stone">
            <span>Tax</span>
            <span>Calculated in Stripe</span>
          </div>
        </div>
        {message ? <p className="mt-4 rounded-md bg-rust/10 p-3 text-sm font-bold text-rust">{message}</p> : null}
        <button className="button button-primary mt-6 w-full" type="button" disabled={!canCheckout} onClick={checkout}>
          {checkingOut ? "Starting checkout..." : "Checkout with Stripe"}
        </button>
      </aside>
    </section>
  );
}
