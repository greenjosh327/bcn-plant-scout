import Image from "next/image";
import Link from "next/link";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { productToGoogleAnalyticsItem } from "@/lib/marketing/google-analytics";
import type { Product } from "@/lib/types";

export function ProductCard({ product }: { product: Product }) {
  const variationLabel =
    product.variations && product.variations.length > 1
      ? `${product.variations.length} options`
      : product.variations?.[0]?.name;

  return (
    <article className="field-card overflow-hidden">
      <Link href={`/shop/product/${product.slug}`}>
        <div className="relative aspect-[4/3] bg-sage">
          <Image
            src={product.images[0]}
            alt={product.name}
            fill
            className="object-cover"
            sizes="(min-width: 900px) 33vw, 100vw"
          />
        </div>
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-stone">
                {product.category}
              </p>
              <h3 className="mt-2 text-2xl font-black text-pine">{product.name}</h3>
              <p className="mt-1 italic text-stone">{product.scientificName}</p>
            </div>
            <p className="rounded-full bg-sage px-3 py-1 text-sm font-black text-pine">
              ${product.price}
            </p>
          </div>
          <p className="mt-4 line-clamp-3 text-sm leading-6 text-ink/75">{product.description}</p>
          <p className="mt-5 text-sm font-black text-rust">
            {product.inventory > 0 ? `${product.inventory} available` : "Sold out"}
          </p>
          {variationLabel ? (
            <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-stone">
              {variationLabel}
            </p>
          ) : null}
        </div>
      </Link>
      <div className="px-5 pb-5">
        {product.variations && product.variations.length > 0 ? (
          <Link href={`/shop/product/${product.slug}`} className="button button-primary w-full">
            Choose options
          </Link>
        ) : (
          <AddToCartButton
            productId={product.id}
            disabled={product.inventory <= 0}
            className="button button-primary w-full"
            analyticsItem={productToGoogleAnalyticsItem(product)}
            analyticsValue={product.price}
          />
        )}
      </div>
    </article>
  );
}
