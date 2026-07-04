"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CART_STORAGE_KEY, normalizeCartLines } from "@/lib/cart";

function readCartCount() {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    const lines = normalizeCartLines(raw ? JSON.parse(raw) : []);
    return lines.reduce((sum, line) => sum + line.quantity, 0);
  } catch {
    return 0;
  }
}

export function CartLink() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const refresh = () => setCount(readCartCount());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("bcn-cart-updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("bcn-cart-updated", refresh);
    };
  }, []);

  return (
    <Link href="/cart" className="button button-secondary relative">
      Cart
      {count > 0 ? (
        <span className="ml-2 rounded-full bg-pine px-2 py-0.5 text-xs font-black text-white">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
