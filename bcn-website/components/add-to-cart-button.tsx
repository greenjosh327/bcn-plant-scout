"use client";

import { CART_STORAGE_KEY, normalizeCartLines } from "@/lib/cart";

type AddToCartButtonProps = {
  productId: string;
  disabled?: boolean;
  label?: string;
  className?: string;
};

export function AddToCartButton({ productId, disabled = false, label = "Add to Cart", className = "button button-primary" }: AddToCartButtonProps) {
  function addToCart() {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    const current = raw ? JSON.parse(raw) : [];
    const next = normalizeCartLines([...current, { productId, quantity: 1 }]);
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("bcn-cart-updated"));
  }

  return (
    <button className={className} disabled={disabled} type="button" onClick={addToCart}>
      {disabled ? "Sold Out" : label}
    </button>
  );
}
