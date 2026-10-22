"use client";

import { useState } from "react";
import { getCategory, getProduct, type Product } from "@/data/menu";
import { site } from "@/data/site";
import { cartStore, MAX_LINE_QUANTITY } from "@/lib/cart-store";
import { GLUTEN_FREE_SURCHARGE, kr, unitPrice } from "@/lib/pricing";
import { DishArt } from "@/components/art";
import { CloseIcon, MinusIcon, PlusIcon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { useOrder } from "./order-provider";

export function ProductDialog() {
  const { activeProductId, closeProduct } = useOrder();
  const product = activeProductId ? getProduct(activeProductId) : undefined;

  return (
    <Modal
      open={!!product}
      onClose={closeProduct}
      label={product ? `Anpassa ${product.name}` : "Anpassa rätt"}
      className="m-auto max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-[560px] overflow-hidden rounded-2xl bg-ivory p-0 shadow-2xl open:flex open:animate-rise open:flex-col"
    >
      {product && <ProductForm key={product.id} product={product} onClose={closeProduct} />}
    </Modal>
  );
}

function ProductForm({ product, onClose }: { product: Product; onClose: () => void }) {
  const { showNotice } = useOrder();
  const category = getCategory(product.category);
  const removable = !!category?.removable && product.ingredients.length > 0;

  const [variantId, setVariantId] = useState(product.variants[0].id);
  const [removed, setRemoved] = useState<string[]>([]);
  const [glutenFree, setGlutenFree] = useState(false);
  const [note, setNote] = useState("");
  const [quantity, setQuantity] = useState(1);

  const price = unitPrice(product, variantId, glutenFree) * quantity;
  const multiVariant = product.variants.length > 1;

  const toggleIngredient = (name: string) =>
    setRemoved((r) => (r.includes(name) ? r.filter((x) => x !== name) : [...r, name]));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    cartStore.add({ productId: product.id, variantId, removed, glutenFree, note: note.trim(), quantity });
    showNotice(`${product.name} lades i varukorgen`);
    onClose();
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="relative shrink-0">
        <DishArt category={product.category} seed={product.number ?? 3} className="h-36 w-full sm:h-44" />
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
            {product.number ? `Nr ${product.number}` : category?.name}
            {product.group && product.number ? ` · ${product.group}` : ""}
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
                <label key={v.id} className="cursor-pointer">
                  <input
                    type="radio"
                    name="variant"
                    value={v.id}
                    checked={variantId === v.id}
                    onChange={() => setVariantId(v.id)}
                    className="peer sr-only"
                  />
                  <span className="block rounded-xl border border-line bg-white px-4 py-3 text-center transition peer-checked:border-gold-deep peer-checked:bg-ink peer-checked:text-ivory peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold">
                    <span className="block text-sm font-semibold">{v.label}</span>
                    <span className="block text-sm opacity-80">{kr(v.price)}</span>
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
                    <input
                      type="checkbox"
                      checked={kept}
                      onChange={() => toggleIngredient(name)}
                      className="peer sr-only"
                    />
                    <span className="flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-white px-4 text-sm transition peer-checked:border-gold-deep peer-checked:bg-cream peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold peer-not-checked:text-muted peer-not-checked:line-through">
                      <span
                        aria-hidden="true"
                        className={`size-1.5 rounded-full ${kept ? "bg-gold-deep" : "bg-line"}`}
                      />
                      {name}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {product.glutenFreeOption && (
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3">
            <span>
              <span className="block text-sm font-semibold">Glutenfri pizzadeg</span>
              <span className="block text-xs text-muted">+{kr(GLUTEN_FREE_SURCHARGE)}</span>
            </span>
            <input
              type="checkbox"
              checked={glutenFree}
              onChange={(e) => setGlutenFree(e.target.checked)}
              className="size-5 accent-[var(--color-gold-deep)]"
            />
          </label>
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

      <footer className="flex shrink-0 items-center gap-3 border-t border-line bg-white px-5 py-4 sm:px-7">
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
          className="flex min-h-12 flex-1 items-center justify-between gap-3 rounded-full bg-gold px-6 text-sm font-semibold text-ink transition hover:bg-gold-light"
        >
          <span>Lägg i varukorg</span>
          <span className="tabular-nums">{kr(price)}</span>
        </button>
      </footer>
    </form>
  );
}
