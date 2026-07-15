"use client";

import { useEffect, useState } from "react";
import { trackShopAnalyticsEvent } from "@/lib/analytics/shop-analytics";
import { CART_STORAGE_KEY, normalizeCartLines } from "@/lib/cart";
import { trackGoogleEvent, type GoogleAnalyticsItem } from "@/lib/marketing/google-analytics";

type AddToCartButtonProps = {
  productId: string;
  variantKey?: string;
  disabled?: boolean;
  label?: string;
  className?: string;
  analyticsItem?: GoogleAnalyticsItem;
  analyticsValue?: number;
};

export function AddToCartButton({
  productId,
  variantKey,
  disabled = false,
  label = "Add to Cart",
  className = "button button-primary",
  analyticsItem,
  analyticsValue
}: AddToCartButtonProps) {
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return;
    const timeout = window.setTimeout(() => setAdded(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [added]);

  function addToCart() {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    const current = raw ? JSON.parse(raw) : [];
    const next = normalizeCartLines([...current, { productId, variantKey, quantity: 1 }]);
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("bcn-cart-updated"));
    if (analyticsItem) {
      trackGoogleEvent("add_to_cart", {
        currency: "USD",
        value: Number(analyticsValue ?? analyticsItem.price ?? 0),
        items: [analyticsItem]
      });
      trackShopAnalyticsEvent("add_to_cart", {
        productId: analyticsItem.item_id,
        productSlug: analyticsItem.item_slug,
        productName: analyticsItem.item_name,
        variantId: analyticsItem.variant_id,
        variantName: analyticsItem.item_variant,
        quantity: analyticsItem.quantity ?? 1,
        valueCents: Math.round(Number(analyticsValue ?? analyticsItem.price ?? 0) * 100),
        currency: "usd"
      });
    }
    setAdded(true);
  }

  return (
    <button className={className} disabled={disabled} type="button" onClick={addToCart}>
      {disabled ? "Sold Out" : added ? "Added to cart" : label}
    </button>
  );
}
