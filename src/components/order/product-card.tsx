"use client";

import Image from "next/image";
import { isOrderable } from "@/lib/menu-client";
import type { PublicProduct } from "@/lib/menu-types";
import { kr } from "@/lib/pricing";
import { DishArt } from "@/components/art";
import type { CategoryId } from "@/data/menu";
import { useOrder } from "./order-provider";

/** Pizza cards show their full recipe, including the tomato-sauce and cheese base. */
export function ingredientText(product: PublicProduct): string {
  if (product.description) return product.description;
  return product.ingredients.map((s, i) => (i === 0 ? s : s.toLowerCase())).join(", ");
}

export function ProductCard({ product, featured = false }: { product: PublicProduct; featured?: boolean }) {
  const { openProduct } = useOrder();
  const multi = product.variants.length > 1;
  const orderable = isOrderable(product);

  return (
    <li className={`group relative overflow-hidden rounded-2xl border border-line bg-white shadow-card transition duration-200 hover:border-gold ${featured ? "grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 p-3 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-4 sm:p-4" : "flex gap-2.5 p-2.5 sm:gap-4 sm:p-3.5"}`}>
      <div className={featured ? "flex min-w-0 flex-col" : "relative size-20 shrink-0 overflow-hidden rounded-xl sm:size-28 md:size-32"}>
        <div className={`relative overflow-hidden rounded-xl ${featured ? "aspect-square w-full" : "size-full"}`}>
          {product.image ? (
            <Image src={product.image} alt={product.name} fill sizes={featured ? "(max-width: 640px) 104px, 136px" : "(max-width: 640px) 80px, 128px"} className="object-cover" />
          ) : (
            <DishArt category={product.category as CategoryId} seed={product.menuNumber ?? 3} className="size-full" />
          )}
        </div>
        {featured && <VariantPrices product={product} multi={multi} orderable={orderable} className="mt-2" />}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            {product.menuNumber && <span className="text-xs font-semibold tabular-nums text-gold-deep shrink-0">{product.menuNumber}.</span>}
            <h3 className="font-display text-[1.05rem] font-semibold leading-tight min-[360px]:text-lg sm:text-xl md:text-[1.35rem]">{product.name}</h3>
          </div>
          <p className="mt-1 text-[0.76rem] leading-snug text-muted sm:text-[0.83rem] sm:leading-relaxed">{ingredientText(product)}</p>
        </div>

        <div className={`mt-2 flex flex-wrap items-end justify-between gap-x-2 gap-y-1.5 pt-1.5 ${featured ? "sm:hidden" : "sm:mt-auto sm:pt-3"}`}>
          {!featured && <VariantPrices product={product} multi={multi} orderable={orderable} />}

          {!featured && (orderable ? (
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
          ))}
        </div>
      </div>

      {featured && (orderable ? (
        <button
          type="button"
          onClick={() => openProduct(product.slug)}
          aria-label={`Beställ ${product.name}`}
          className="absolute bottom-3 right-3 inline-flex min-h-9 items-center justify-center rounded-full border border-gold-deep/60 px-3.5 text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-ink transition after:absolute after:inset-0 after:rounded-2xl after:content-[''] group-hover:border-gold group-hover:bg-gold sm:bottom-4 sm:right-4 sm:min-h-11 sm:px-5 sm:text-xs sm:tracking-[0.12em]"
        >
          Beställ
        </button>
      ) : (
        <p className="absolute bottom-3 right-3 max-w-[8.5rem] text-right text-[0.7rem] leading-snug text-muted sm:bottom-4 sm:right-4 sm:text-xs">
          Pris bekräftas snart – kan inte beställas online än
        </p>
      ))}
    </li>
  );
}

function VariantPrices({
  product,
  multi,
  orderable,
  className = "",
}: {
  product: PublicProduct;
  multi: boolean;
  orderable: boolean;
  className?: string;
}) {
  if (!multi) {
    return <p className={`${className} font-display text-lg font-semibold tabular-nums min-[360px]:text-xl sm:text-2xl ${orderable ? "" : "text-muted"}`}>{kr(product.variants[0].priceSek)}</p>;
  }

  return (
    <dl className={`${className} space-y-0.5 text-xs text-muted shrink-0`}>
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
  );
}
