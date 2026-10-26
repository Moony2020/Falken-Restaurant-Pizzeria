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
    <li className="group relative flex gap-2.5 rounded-2xl border border-line bg-white p-2.5 shadow-card transition duration-200 hover:border-gold overflow-hidden sm:gap-4 sm:p-3.5">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-xl sm:size-28 md:size-32">
        {product.image ? (
          <Image src={product.image} alt={product.name} fill sizes="(max-width: 640px) 80px, 128px" className="object-cover" />
        ) : (
          <DishArt category={product.category as CategoryId} seed={product.menuNumber ?? 3} className="size-full" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            {product.menuNumber && <span className="text-xs font-semibold tabular-nums text-gold-deep shrink-0">{product.menuNumber}.</span>}
            <h3 className="font-display text-[1.05rem] font-semibold leading-tight min-[360px]:text-lg sm:text-xl md:text-[1.35rem]">{product.name}</h3>
          </div>
          <p className="mt-1 line-clamp-2 text-[0.76rem] leading-snug text-muted sm:line-clamp-3 sm:text-[0.83rem] sm:leading-relaxed">{ingredientText(product)}</p>
        </div>

        <div className="mt-2 flex flex-wrap items-end justify-between gap-x-2 gap-y-1.5 pt-1.5 sm:mt-auto sm:pt-3">
          {multi ? (
            <dl className="space-y-0.5 text-xs text-muted shrink-0">
              {product.variants.map((v) => (
                <div key={v.id} className="flex items-baseline gap-1.5 sm:gap-2">
                  <dt className="w-9 text-[0.7rem] font-medium min-[360px]:w-10 sm:w-11 sm:text-xs">{v.label}</dt>
                  <dd className={`text-xs font-semibold tabular-nums sm:text-sm ${v.orderable ? "text-ink" : "text-muted line-through"}`}>
                    {kr(v.priceSek)}
                    {!v.orderable && <span className="sr-only"> (kan inte beställas just nu)</span>}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className={`font-display text-lg font-semibold tabular-nums min-[360px]:text-xl sm:text-2xl ${orderable ? "" : "text-muted"}`}>{kr(product.variants[0].priceSek)}</p>
          )}

          {orderable ? (
            <button
              type="button"
              onClick={() => openProduct(product.slug)}
              aria-label={`Beställ ${product.name}`}
              className="inline-flex min-h-8 items-center justify-center rounded-full border border-gold-deep/60 px-3 text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-ink transition after:absolute after:inset-0 after:rounded-2xl after:content-[''] group-hover:border-gold group-hover:bg-gold shrink-0 self-end ml-auto min-[360px]:min-h-9 min-[360px]:px-3.5 min-[360px]:ml-0 sm:min-h-11 sm:px-5 sm:text-xs sm:tracking-[0.12em]"
            >
              Beställ
            </button>
          ) : (
            <p className="max-w-[8.5rem] text-right text-[0.7rem] leading-snug text-muted sm:text-xs">Pris bekräftas snart – kan inte beställas online än</p>
          )}
        </div>
      </div>
    </li>
  );
}
