"use client";

import Image from "next/image";
import { isOrderable } from "@/lib/menu-client";
import type { PublicProduct } from "@/lib/menu-types";
import { kr } from "@/lib/pricing";
import { DishArt } from "@/components/art";
import type { CategoryId } from "@/data/menu";
import { useOrder } from "./order-provider";

/** The tomato sauce + cheese base is stated once per category, so cards list only what sets a dish apart. */
export function ingredientText(product: PublicProduct): string {
  if (product.description) return product.description;
  const items =
    (product.category === "pizza" || product.category === "kebabpizza") &&
    product.ingredients[0] === "Tomatsås" &&
    product.ingredients[1] === "Ost"
      ? product.ingredients.slice(2)
      : product.ingredients;
  return items.map((s, i) => (i === 0 ? s : s.toLowerCase())).join(", ");
}

export function ProductCard({ product }: { product: PublicProduct }) {
  const { openProduct } = useOrder();
  const multi = product.variants.length > 1;
  const orderable = isOrderable(product);

  return (
    <li className="group relative flex gap-4 rounded-2xl border border-line bg-white p-3 shadow-card transition duration-200 hover:border-gold">
      <div className="relative size-28 shrink-0 overflow-hidden rounded-xl sm:size-32">
        {product.image ? (
          <Image src={product.image} alt={product.name} fill sizes="128px" className="object-cover" />
        ) : (
          <DishArt category={product.category as CategoryId} seed={product.menuNumber ?? 3} className="size-full" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-baseline gap-2">
          {product.menuNumber && <span className="text-xs font-semibold tabular-nums text-gold-deep">{product.menuNumber}.</span>}
          <h3 className="font-display text-xl font-semibold leading-tight sm:text-[1.4rem]">{product.name}</h3>
        </div>
        <p className="mt-1 line-clamp-3 text-[0.83rem] leading-relaxed text-muted">{ingredientText(product)}</p>

        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          {multi ? (
            <dl className="space-y-0.5 text-xs text-muted">
              {product.variants.map((v) => (
                <div key={v.id} className="flex items-baseline gap-2">
                  <dt className="w-11">{v.label}</dt>
                  <dd className={`text-sm font-semibold tabular-nums ${v.orderable ? "text-ink" : "text-muted line-through"}`}>
                    {kr(v.priceSek)}
                    {!v.orderable && <span className="sr-only"> (kan inte beställas just nu)</span>}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className={`font-display text-2xl font-semibold tabular-nums ${orderable ? "" : "text-muted"}`}>{kr(product.variants[0].priceSek)}</p>
          )}

          {orderable ? (
            <button
              type="button"
              onClick={() => openProduct(product.slug)}
              aria-label={`Beställ ${product.name}`}
              className="inline-flex min-h-11 items-center rounded-full border border-gold-deep/60 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-ink transition after:absolute after:inset-0 after:rounded-2xl after:content-[''] group-hover:border-gold group-hover:bg-gold"
            >
              Beställ
            </button>
          ) : (
            <p className="max-w-[9rem] text-right text-xs leading-snug text-muted">Pris bekräftas snart – kan inte beställas online än</p>
          )}
        </div>
      </div>
    </li>
  );
}
