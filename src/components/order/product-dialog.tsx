"use client";

import Image from "next/image";
import { useMemo, useState, type ReactNode } from "react";
import {
  IF_UNAVAILABLE,
  IF_UNAVAILABLE_LABELS_SV,
  type IfUnavailable,
} from "@/data/modifier-groups";
import { CURRENT_SEASON, site } from "@/data/site";
import { getOpenStatus } from "@/lib/hours";
import { useNow } from "@/lib/use-now";
import type { CategoryId } from "@/data/menu";
import { cartStore, MAX_LINE_QUANTITY } from "@/lib/cart-store";
import {
  firstOrderableVariant,
  groupsFor,
  modifierPrice,
  previewUnitPrice,
  toggleModifier,
  type ModifierGroupView,
} from "@/lib/menu-client";
import type {
  PublicCategory,
  PublicMenu,
  PublicProduct,
} from "@/lib/menu-types";
import { useMenu } from "@/lib/menu-store";
import { kr } from "@/lib/pricing";
import { DishArt } from "@/components/art";
import { CheckIcon, CloseIcon, MinusIcon, PlusIcon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { useOrder } from "./order-provider";

export function ProductDialog() {
  const { activeProductId, closeProduct } = useOrder();
  const menu = useMenu();
  const ready = menu.status === "ready" ? menu.menu : null;
  const product =
    ready && activeProductId
      ? ready.products.find((p) => p.slug === activeProductId)
      : undefined;
  const category =
    ready && product
      ? ready.categories.find((c) => c.slug === product.category)
      : undefined;

  return (
    <Modal
      open={!!product}
      onClose={closeProduct}
      label={product ? `Anpassa ${product.name}` : "Anpassa rätt"}
      className="m-auto max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-[600px] overflow-clip rounded-2xl bg-ink p-0 shadow-2xl open:flex open:animate-rise open:flex-col"
    >
      {ready && product && (
        <ProductForm
          key={product.slug}
          product={product}
          category={category}
          menu={ready}
          onClose={closeProduct}
        />
      )}
    </Modal>
  );
}

/** One titled card of choices: a header (title, hint, "optional" badge) and rows below it. */
function OptionCard({
  title,
  hint,
  badge = "Valfritt",
  filler = false,
  more,
  children,
}: {
  title: string;
  hint?: string;
  badge?: string;
  /** True when the number of rows is odd, so the empty cell in the last row is filled in. */
  filler?: boolean;
  /** Full-width row after the grid, e.g. a "show more" button. */
  more?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-2xl border border-line bg-white"
      aria-label={title}
    >
      <header className="flex items-start justify-between gap-3 px-5 py-4">
        <div>
          <h3 className="font-display text-xl font-semibold leading-tight">
            {title}
          </h3>
          {hint && (
            <p className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</p>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-cream px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">
          {badge}
        </span>
      </header>
      {/* Rows sit in a hairline grid: the list paints the lines, every cell is white, so all cells get identical
          borders. One column on phones, two from the "sm" breakpoint. */}
      <ul className="grid gap-px border-t border-line bg-line sm:grid-cols-2">
        {children}
        {filler && (
          <li aria-hidden="true" className="hidden bg-white sm:block" />
        )}
        {more}
      </ul>
    </section>
  );
}

/** A tappable row with a square check box on the left and an optional price on the right. */
function CheckRow({
  label,
  right,
  checked,
  disabled,
  note,
  onChange,
}: {
  label: string;
  right?: string;
  checked: boolean;
  disabled?: boolean;
  note?: string;
  onChange: () => void;
}) {
  return (
    <li className="bg-white">
      <label
        className={`flex min-h-14 items-center gap-4 px-5 py-2 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-cream/60"}`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="grid size-6 shrink-0 place-items-center rounded-md border-2 border-line bg-white text-transparent transition peer-checked:border-ink peer-checked:bg-ink peer-checked:text-gold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold"
        >
          <CheckIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.95rem] font-medium">{label}</span>
          {note && <span className="block text-xs text-muted">{note}</span>}
        </span>
        {right && (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-gold-deep">
            {right}
          </span>
        )}
      </label>
    </li>
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
  // While the restaurant is closed nothing can be added: the customer is told why instead of getting a dead order.
  const now = useNow();
  const closedStatus =
    now === null ? null : getOpenStatus(new Date(now), CURRENT_SEASON);
  const closed = !!closedStatus && !closedStatus.isOpen;
  const removable = !!category?.removable && product.ingredients.length > 0;
  const groups = useMemo(() => groupsFor(product, menu), [product, menu]);

  const [variantId, setVariantId] = useState(
    firstOrderableVariant(product)?.id ?? product.variants[0].id,
  );
  const [removed, setRemoved] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [ifUnavailable, setIfUnavailable] = useState<IfUnavailable>("call");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [quantity, setQuantity] = useState(1);

  const selected = chosen.map((slug) => ({ slug, quantity: 1 }));
  const unit = previewUnitPrice(product, variantId, selected, menu);
  const canOrder = unit !== null && !closed;
  const multiVariant = product.variants.length > 1;

  const changeVariant = (id: string) => {
    setVariantId(id);
    // An extra that has no confirmed price for the new size can't stay selected.
    setChosen((c) =>
      c.filter((slug) => {
        const m = menu.modifiers.find((x) => x.slug === slug);
        return m && modifierPrice(m, id) !== undefined;
      }),
    );
  };

  const toggleRemoved = (name: string) =>
    setRemoved((r) =>
      r.includes(name) ? r.filter((x) => x !== name) : [...r, name],
    );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canOrder) return;
    cartStore.add({
      productSlug: product.slug,
      variantId,
      removed,
      modifiers: selected,
      note: note.trim(),
      ifUnavailable,
      quantity,
    });
    showNotice(`${product.name} lades i varukorgen`);
    onClose();
  };

  const REMOVE_COLLAPSE = 6;
  const removeRows = expanded.__remove
    ? product.ingredients
    : product.ingredients.slice(0, REMOVE_COLLAPSE);

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="relative shrink-0 h-36 w-full overflow-hidden sm:h-44">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 100vw, 560px"
            className="object-cover"
          />
        ) : (
          <DishArt
            category={product.category as CategoryId}
            seed={product.menuNumber ?? 3}
            className="size-full"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 pointer-events-none" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Stäng"
          className="absolute right-3 top-3 z-10 grid size-11 place-items-center rounded-full bg-ink/70 text-ivory backdrop-blur transition hover:bg-ink"
        >
          <CloseIcon className="size-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-ivory px-4 py-5 sm:px-6">
        <header className="px-1">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold-deep">
            {product.menuNumber ? `Nr ${product.menuNumber}` : category?.name}
            {product.group && product.menuNumber ? ` · ${product.group}` : ""}
          </p>
          <h2 className="mt-1 font-display text-3xl font-semibold leading-tight">
            {product.name}
          </h2>
          {canOrder && (
            <p className="mt-1 font-display text-2xl font-semibold text-gold-deep tabular-nums">
              {kr(unit ?? 0)}
            </p>
          )}
          {product.ingredients.length > 0 && (
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {product.ingredients.join(", ")}.
            </p>
          )}
          {product.description && (
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {product.description}
            </p>
          )}
        </header>

        {multiVariant && (
          <fieldset className="px-1">
            <legend className="mb-2 font-display text-xl font-semibold">
              Storlek
            </legend>
            <div className="grid grid-cols-2 gap-3">
              {product.variants.map((v) => (
                <label
                  key={v.id}
                  className={
                    v.orderable ? "cursor-pointer" : "cursor-not-allowed"
                  }
                >
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
                    <span className="block text-sm font-semibold">
                      {v.label}
                    </span>
                    <span
                      className={`block text-sm ${v.orderable ? "opacity-80" : "line-through"}`}
                    >
                      {kr(v.priceSek)}
                    </span>
                    {!v.orderable && (
                      <span className="block text-[0.7rem] leading-tight">
                        Pris bekräftas snart
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {groups.map((view) => (
          <ExtrasGroup
            key={view.def.slug}
            view={view}
            variantId={variantId}
            chosen={chosen}
            expanded={!!expanded[view.def.slug]}
            onExpand={() =>
              setExpanded((e) => ({ ...e, [view.def.slug]: true }))
            }
            onToggle={(slug) => setChosen((c) => toggleModifier(c, slug, view))}
          />
        ))}

        {removable && (
          <OptionCard
            title="Ta bort ingredienser"
            hint="Välj det du vill ta bort – det är gratis"
            filler={removeRows.length % 2 === 1}
            more={
              !expanded.__remove &&
              product.ingredients.length > REMOVE_COLLAPSE ? (
                <li className="bg-white sm:col-span-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((e) => ({ ...e, __remove: true }))
                    }
                    className="flex min-h-12 w-full items-center justify-center text-xs font-semibold uppercase tracking-[0.14em] text-muted hover:text-ink"
                  >
                    Visa {product.ingredients.length - REMOVE_COLLAPSE} till
                  </button>
                </li>
              ) : undefined
            }
          >
            {removeRows.map((name) => (
              <CheckRow
                key={name}
                label={name}
                right="Gratis"
                checked={removed.includes(name)}
                onChange={() => toggleRemoved(name)}
              />
            ))}
          </OptionCard>
        )}

        <section
          aria-label="Allergier och önskemål"
          className="rounded-2xl border border-line bg-white px-5 py-4"
        >
          <label htmlFor="note" className="font-display text-xl font-semibold">
            Allergier/önskemål
          </label>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            Var noga med att ange om du har en allergi eller bara vill undvika
            något. Vid allvarlig allergi, ring oss på{" "}
            <a href={site.phoneHref} className="underline underline-offset-2">
              {site.phone}
            </a>
            .
          </p>
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            rows={3}
            placeholder={product.choiceHint ?? "T.ex. extra krispig botten"}
            className="mt-3 w-full resize-none rounded-xl border border-line bg-ivory px-4 py-3 text-sm placeholder:text-muted/70"
          />
        </section>

        <section
          aria-label="Om något inte finns"
          className="rounded-2xl border border-line bg-white px-5 py-4"
        >
          <label
            htmlFor="if-unavailable"
            className="font-display text-xl font-semibold"
          >
            Om något inte finns
          </label>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            Vad ska vi göra om en ingrediens i rätten är slut?
          </p>
          <select
            id="if-unavailable"
            value={ifUnavailable}
            onChange={(e) => setIfUnavailable(e.target.value as IfUnavailable)}
            className="select-chevron mt-3 min-h-12 w-full rounded-xl border border-line bg-ivory pl-4 text-sm"
          >
            {IF_UNAVAILABLE.map((v) => (
              <option key={v} value={v}>
                {IF_UNAVAILABLE_LABELS_SV[v]}
              </option>
            ))}
          </select>
        </section>
      </div>

      <footer className="shrink-0 border-t border-line bg-white px-4 py-3 sm:px-6">
        {closed ? (
          <p
            role="status"
            className="mb-3 rounded-lg bg-cream px-3 py-2 text-xs leading-relaxed text-muted"
          >
            Vi har stängt just nu ({closedStatus?.label.toLowerCase().replace(/^stängt\s*·\s*/, "")}), så du
            kan inte lägga till rätter i varukorgen. Välkommen tillbaka när vi
            öppnar!
          </p>
        ) : unit === null ? (
          <p
            role="status"
            className="mb-3 rounded-lg bg-cream px-3 py-2 text-xs leading-relaxed text-muted"
          >
            Den här storleken kan inte beställas online just nu. Välj en annan
            storlek eller ring oss på {site.phone}.
          </p>
        ) : (
          <p className="mb-3 text-xs text-muted" aria-live="polite">
            Per rätt med dina val:{" "}
            <span className="font-semibold text-ink tabular-nums">
              {kr(unit ?? 0)}
            </span>
            <span aria-hidden="true"> · </span>
            Totalt ({quantity} st):{" "}
            <span className="font-semibold text-ink tabular-nums">
              {kr((unit ?? 0) * quantity)}
            </span>
          </p>
        )}
        <div className="flex items-center gap-3">
          <div
            className="flex items-center rounded-full border border-line"
            role="group"
            aria-label="Antal"
          >
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              aria-label="Minska antal"
              className="grid size-11 place-items-center rounded-full transition hover:bg-cream disabled:opacity-35"
            >
              <MinusIcon className="size-4" />
            </button>
            <output
              aria-live="polite"
              className="w-7 text-center text-sm font-semibold tabular-nums"
            >
              {quantity}
            </output>
            <button
              type="button"
              onClick={() =>
                setQuantity((q) => Math.min(MAX_LINE_QUANTITY, q + 1))
              }
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
            className="flex min-h-12 flex-1 items-center justify-between gap-3 rounded-full bg-gold px-5 text-sm font-semibold text-ink transition hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-45 sm:px-6"
          >
            <span>
              <span className="sm:hidden">Lägg till</span>
              <span className="hidden sm:inline">Lägg i varukorg</span>
            </span>
            {unit !== null && (
              <span className="tabular-nums">{kr((unit ?? 0) * quantity)}</span>
            )}
          </button>
        </div>
      </footer>
    </form>
  );
}

function ExtrasGroup({
  view,
  variantId,
  chosen,
  expanded,
  onExpand,
  onToggle,
}: {
  view: ModifierGroupView;
  variantId: string;
  chosen: string[];
  expanded: boolean;
  onExpand: () => void;
  onToggle: (slug: string) => void;
}) {
  const { def, items } = view;
  const pickedInGroup = items.filter((m) => chosen.includes(m.slug)).length;
  const full = def.kind === "multi" && pickedInGroup >= def.max;
  const limit = def.collapseAfter ?? items.length;
  // Anything already picked stays visible even when the list is collapsed.
  const visible = expanded
    ? items
    : items.filter((m, i) => i < limit || chosen.includes(m.slug));
  const hidden = items.length - visible.length;
  const hint =
    def.kind === "single"
      ? "Välj upp till 1 (valfritt)"
      : `Välj upp till ${def.max} (valfritt)${def.hintSv ? ` · ${def.hintSv}` : ""}`;

  return (
    <OptionCard
      title={def.titleSv}
      hint={hint}
      filler={visible.length % 2 === 1}
      more={
        hidden > 0 ? (
          <li className="bg-white sm:col-span-2">
            <button
              type="button"
              onClick={onExpand}
              className="flex min-h-12 w-full items-center justify-center text-xs font-semibold uppercase tracking-[0.14em] text-muted hover:text-ink"
            >
              Visa {hidden} till
            </button>
          </li>
        ) : undefined
      }
    >
      {visible.map((m) => {
        const price = modifierPrice(m, variantId);
        const checked = chosen.includes(m.slug);
        return (
          <CheckRow
            key={m.slug}
            label={m.label}
            right={price !== undefined ? `+ ${kr(price)}` : undefined}
            note={
              price === undefined
                ? "Finns inte för den här storleken"
                : undefined
            }
            checked={checked}
            disabled={price === undefined || (full && !checked)}
            onChange={() => onToggle(m.slug)}
          />
        );
      })}
    </OptionCard>
  );
}
