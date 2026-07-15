"use client";

import { useMemo, useState } from "react";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { formatMoney, getVariationKey } from "@/lib/cart";
import { productToGoogleAnalyticsItem } from "@/lib/marketing/google-analytics";
import type { Product } from "@/lib/types";

export function ProductPurchasePanel({ product }: { product: Product }) {
  const options = product.variations ?? [];
  const firstAvailable = options.find((option) => option.inventory > 0) ?? options[0];
  const [selectedKey, setSelectedKey] = useState(firstAvailable ? getVariationKey(firstAvailable) : "");

  const selectedVariation = useMemo(
    () => options.find((option) => getVariationKey(option) === selectedKey),
    [options, selectedKey]
  );

  const price = selectedVariation?.price ?? product.price;
  const inventory = selectedVariation?.inventory ?? product.inventory;
  const hasOptions = options.length > 0;

  return (
    <div className="mt-8 grid gap-4">
      {hasOptions ? (
        <div className="field-card p-4">
          <label className="block">
            <span className="text-lg font-black text-pine">Choose an option</span>
            <select
              className="admin-input mt-3"
              value={selectedKey}
              onChange={(event) => setSelectedKey(event.target.value)}
            >
              {options.map((option) => {
                const key = getVariationKey(option);
                return (
                  <option key={key} value={key} disabled={option.inventory <= 0}>
                    {option.name} - {formatMoney(option.price)} {option.inventory > 0 ? `(${option.inventory} available)` : "(sold out)"}
                  </option>
                );
              })}
            </select>
          </label>
          {selectedVariation ? (
            <p className="mt-3 text-sm font-bold text-stone">
              {selectedVariation.sku ? `SKU ${selectedVariation.sku} · ` : ""}
              {selectedVariation.inventory > 0 ? `${selectedVariation.inventory} available` : "Sold out"}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <p className="text-3xl font-black text-pine">{formatMoney(price)}</p>
        <p className="rounded-full bg-sage px-4 py-2 text-sm font-black text-pine">
          {inventory > 0 ? `${inventory} in stock` : "Sold out"}
        </p>
      </div>

      <AddToCartButton
        productId={product.id}
        variantKey={selectedVariation ? getVariationKey(selectedVariation) : undefined}
        disabled={inventory <= 0 || (hasOptions && !selectedVariation)}
        className="button button-primary w-full md:w-auto"
        analyticsItem={productToGoogleAnalyticsItem(product, selectedVariation)}
        analyticsValue={price}
      />
    </div>
  );
}
