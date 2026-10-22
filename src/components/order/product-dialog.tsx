"use client";

import { useMemo, useState } from "react";
import { site } from "@/data/site";
import type { CategoryId } from "@/data/menu";
import { cartStore, MAX_LINE_QUANTITY } from "@/lib/cart-store";
import { firstOrderableVariant, modifierPrice, modifiersFor, previewUnitPrice } from "@/lib/menu-client";
import type { PublicCategory, PublicMenu, PublicProduct } from "@/lib/menu-types";
import { useMenu } from "@/lib/menu-store";
import { kr } from "@/lib/pricing";
import { DishArt } from "@/components/art";
import { CloseIcon, MinusIcon, PlusIcon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { useOrder } from "./order-provider";

export function ProductDialog() {
  const { activeProductId, closeProduct } = useOrder();
  const menu = useMenu();
  const ready = menu.status === "ready" ? menu.menu : null;
  const product = ready && activeProductId ? ready.products.find((p) => p.slug === activeProductId) : undefined;
  const category = ready && product ? ready.categories.find((c) => c.slug === product.category) : undefined;

  return (
    <Modal
      open={!!product}
      onClose={closeProduct}
      label={product ? `Anpassa ${product.name}` : "Anpassa rätt"}
      className="m-auto max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-[560px] overflow-hidden rounded-2xl bg-ivory p-0 shadow-2xl open:flex open:animate-rise open:flex-col"
    >
      {ready && product && <ProductForm key={product.slug} product={product} category={category} menu={ready} onClose={closeProduct} />}
    </Modal>
  );
}

function ProductForm({
  product,
  category,
  menu,
  onClose,
}: {
  product: PublicProduct;
  category: PublicCategory | undefined;
  menu: PublicMenu;
  onClose: () => void;
}) {
  const { showNotice } = useOrder();
  const removable = !!category?.removable && product.ingredients.length > 0;
  const extras = useMemo(() => modifiersFor(product, menu), [product, menu]);

  const [variantId, setVariantId] = useState(firstOrderableVariant(product)?.id ?? product.variants[0].id);
  const [removed, setRemoved] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [quantity, setQuantity] = useState(1);

  const selected = chosen.map((slug) => ({ slug, quantity: 1 }));
  const unit = previewUnitPrice(product, variantId, selected, menu);
  const canOrder = unit !== null;
  const multiVariant = product.variants.length > 1;

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const changeVariant = (id: string) => {
    setVariantId(id);
    // An extra that has no confirmed price for the new size can't stay selected.
    setChosen((c) =>
      c.filter((slug) => {
        const m = extras.find((x) => x.slug === slug);
        return m && modifierPrice(m, id) !== undefined;
      }),
    );
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canOrder) return;
    cartStore.add({ productSlug: product.slug, variantId, removed, modifiers: selected, note: note.trim(), quantity });
    showNotice(`${product.name} lades i varukorgen`);
    onClose();
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="relative shrink-0">
        <DishArt category={product.category as CategoryId} seed={product.menuNumber ?? 3} className="h-36 w-full sm:h-44" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Stäng"
          className="absolute right-3 top-3 grid size-11 place-items-center rounded-full bg-ink/70 text-ivory backdrop-blur transition hover:bg-ink"
        >
          <CloseIcon className="size-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-7">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold-deep">
            {product.menuNumber ? `Nr ${product.menuNumber}` : category?.name}
            {product.group && product.menuNumber ? ` · ${product.group}` : ""}
          </p>
          <h2 className="mt-1 font-display text-3xl font-semibold leading-tight">{product.name}</h2>
          {product.ingredients.length > 0 && !removable && (
            <p className="mt-2 text-sm leading-relaxed text-muted">{product.ingredients.join(", ")}</p>
          )}
          {product.description && <p className="mt-2 text-sm leading-relaxed text-muted">{product.description}</p>}
        </header>

        {multiVariant && (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Storlek</legend>
            <div className="grid grid-cols-2 gap-3">
              {product.variants.map((v) => (
                <label key={v.id} className={v.orderable ? "cursor-pointer" : "cursor-not-allowed"}>
                  <input
                    type="radio"
                    name="variant"
                    value={v.id}
                    checked={variantId === v.id}
                    disabled={!v.orderable}
                    onChange={() => changeVariant(v.id)}
                    className="peer sr-only"
                  />
                  <span className="block rounded-xl border border-line bg-white px-4 py-3 text-center transition peer-checked:border-gold-deep peer-checked:bg-ink peer-checked:text-ivory peer-disabled:bg-cream peer-disabled:text-muted peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold">
                    <span className="block text-sm font-semibold">{v.label}</span>
                    <span className={`block text-sm ${v.orderable ? "opacity-80" : "line-through"}`}>{kr(v.priceSek)}</span>
                    {!v.orderable && <span className="block text-[0.7rem] leading-tight">Pris bekräftas snart</span>}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {removable && (
          <fieldset>
            <legend className="text-sm font-semibold">Ingredienser</legend>
            <p className="mb-2 text-xs text-muted">Avmarkera det du vill ta bort. Det är gratis.</p>
            <div className="flex flex-wrap gap-2">
              {product.ingredients.map((name) => {
                const kept = !removed.includes(name);
                return (
                  <label key={name} className="cursor-pointer">
                    <input type="checkbox" checked={kept} onChange={() => toggle(removed, setRemoved, name)} className="peer sr-only" />
                    <span className="flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-white px-4 text-sm transition peer-checked:border-gold-deep peer-checked:bg-cream peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold peer-not-checked:text-muted peer-not-checked:line-through">
                      <span aria-hidden="true" className={`size-1.5 rounded-full ${kept ? "bg-gold-deep" : "bg-line"}`} />
                      {name}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {extras.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-semibold">Tillval</legend>
            {extras.map((m) => {
              const price = modifierPrice(m, variantId);
              const available = price !== undefined;
              return (
                <label
                  key={m.slug}
                  className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 ${available ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                >
                  <span>
                    <span className="block text-sm font-semibold">{m.label}</span>
                    <span className="block text-xs text-muted">{available ? `+${kr(price)}` : "Finns inte för den här storleken"}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={chosen.includes(m.slug)}
                    disabled={!available}
                    onChange={() => toggle(chosen, setChosen, m.slug)}
                    className="size-5 accent-[var(--color-gold-deep)]"
                  />
                </label>
              );
            })}
          </fieldset>
        )}

        <div>
          <label htmlFor="note" className="mb-1 block text-sm font-semibold">
            Kommentar till köket <span className="font-normal text-muted">(valfritt)</span>
          </label>
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder={product.choiceHint ?? "T.ex. extra krispig botten"}
            className="w-full resize-none rounded-xl border border-line bg-white px-4 py-3 text-sm placeholder:text-muted/70"
          />
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Har du allergi? Skriv det här eller ring oss på{" "}
            <a href={site.phoneHref} className="underline underline-offset-2">
              {site.phone}
            </a>
            .
          </p>
        </div>
      </div>

      <footer className="shrink-0 border-t border-line bg-white px-5 py-4 sm:px-7">
        {!canOrder && (
          <p role="status" className="mb-3 rounded-lg bg-cream px-3 py-2 text-xs leading-relaxed text-muted">
            Den här storleken kan inte beställas online just nu. Välj en annan storlek eller ring oss på {site.phone}.
          </p>
        )}
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-full border border-line" role="group" aria-label="Antal">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              aria-label="Minska antal"
              className="grid size-11 place-items-center rounded-full transition hover:bg-cream disabled:opacity-35"
            >
              <MinusIcon className="size-4" />
            </button>
            <output aria-live="polite" className="w-7 text-center text-sm font-semibold tabular-nums">
              {quantity}
            </output>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(MAX_LINE_QUANTITY, q + 1))}
              disabled={quantity >= MAX_LINE_QUANTITY}
              aria-label="Öka antal"
              className="grid size-11 place-items-center rounded-full transition hover:bg-cream disabled:opacity-35"
            >
              <PlusIcon className="size-4" />
            </button>
          </div>
          <button
            type="submit"
            disabled={!canOrder}
            className="flex min-h-12 flex-1 items-center justify-between gap-3 rounded-full bg-gold px-6 text-sm font-semibold text-ink transition hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span>
              <span className="sm:hidden">Lägg till</span>
              <span className="hidden sm:inline">Lägg i varukorg</span>
            </span>
            {unit !== null && <span className="tabular-nums">{kr(unit * quantity)}</span>}
          </button>
        </div>
      </footer>
    </form>
  );
}
