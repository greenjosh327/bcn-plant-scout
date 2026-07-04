"use client";

import { useEffect, useState } from "react";
import { CART_STORAGE_KEY, normalizeCartLines } from "@/lib/cart";

type AddToCartButtonProps = {
  productId: string;
  variantKey?: string;
  disabled?: boolean;
  label?: string;
  className?: string;
};

export function AddToCartButton({ productId, variantKey, disabled = false, label = "Add to Cart", className = "button button-primary" }: AddToCartButtonProps) {
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
    setAdded(true);
  }

  return (
    <button className={className} disabled={disabled} type="button" onClick={addToCart}>
      {disabled ? "Sold Out" : added ? "Added to cart" : label}
    </button>
  );
}
