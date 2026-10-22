"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getProduct } from "@/data/menu";
import { CURRENT_SEASON, LAST_PICKUP_BEFORE_CLOSE, PREP_MINUTES, SLOT_STEP_MINUTES, site } from "@/data/site";
import { cartStore, MAX_LINE_QUANTITY, type CartLine } from "@/lib/cart-store";
import { getOpenStatus, getPickupSlots } from "@/lib/hours";
import { kr, lineTotal } from "@/lib/pricing";
import { useNow } from "@/lib/use-now";
import { DishArt } from "@/components/art";
import { ArrowIcon, CartIcon, CloseIcon, MinusIcon, PhoneIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { useOrder } from "./order-provider";

export function CartDrawer() {
  const { cartOpen, closeCart } = useOrder();
  return (
    <Modal
      open={cartOpen}
      onClose={closeCart}
      label="Varukorg"
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-[460px] bg-ivory p-0 shadow-2xl open:flex open:flex-col open:[animation:slide-in_0.32s_cubic-bezier(0.2,0.7,0.2,1)_both]"
    >
      <CartContents />
    </Modal>
  );
}

type Step = "cart" | "details";

function CartContents() {
  const { lines, subtotal, count, closeCart } = useOrder();
  const [step, setStep] = useState<Step>("cart");

  return (
    <>
      <header className="flex shrink-0 items-center justify-between border-b border-line bg-ink px-5 py-4 text-ivory">
        <div>
          <h2 className="font-display text-2xl font-medium">{step === "cart" ? "Din beställning" : "Dina uppgifter"}</h2>
          <p className="text-xs text-muted-dark">
            {count > 0 ? `${count} ${count === 1 ? "rätt" : "rätter"} · Avhämtning` : "Avhämtning"}
          </p>
        </div>
        <button
          type="button"
          onClick={closeCart}
          aria-label="Stäng varukorgen"
          className="grid size-11 place-items-center rounded-full transition hover:bg-ink-3"
        >
          <CloseIcon className="size-5" />
        </button>
      </header>

      {lines.length === 0 ? (
        <EmptyCart onNavigate={closeCart} />
      ) : step === "cart" ? (
        <>
          <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto px-5">
            {lines.map((line) => (
              <CartItem key={line.key} line={line} />
            ))}
          </ul>
          <footer className="shrink-0 space-y-3 border-t border-line bg-white px-5 py-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">Summa</span>
              <span className="font-display text-3xl font-semibold tabular-nums">{kr(subtotal)}</span>
            </div>
            <button
              type="button"
              onClick={() => setStep("details")}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-gold text-sm font-semibold text-ink transition hover:bg-gold-light"
            >
              Gå vidare <ArrowIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => cartStore.clear()}
              className="mx-auto block min-h-11 px-3 text-xs text-muted underline underline-offset-2 hover:text-ink"
            >
              Töm varukorgen
            </button>
          </footer>
        </>
      ) : (
        <Details subtotal={subtotal} onBack={() => setStep("cart")} />
      )}
    </>
  );
}

function EmptyCart({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-cream text-gold-deep">
        <CartIcon className="size-7" />
      </span>
      <div>
        <p className="font-display text-2xl font-semibold">Din varukorg är tom</p>
        <p className="mt-1 text-sm text-muted">Välj något gott från menyn så dyker det upp här.</p>
      </div>
      <Link
        href="/meny"
        onClick={onNavigate}
        className="inline-flex min-h-12 items-center rounded-full bg-gold px-7 text-sm font-semibold text-ink transition hover:bg-gold-light"
      >
        Se menyn
      </Link>
    </div>
  );
}

function CartItem({ line }: { line: CartLine }) {
  const product = getProduct(line.productId);
  if (!product) return null;
  const variant = product.variants.find((v) => v.id === line.variantId);
  const total = lineTotal(product, line);
  const details = [
    product.variants.length > 1 ? variant?.label : null,
    line.glutenFree ? "Glutenfri deg" : null,
    line.removed.length > 0 ? `Utan: ${line.removed.join(", ").toLowerCase()}` : null,
  ].filter(Boolean);

  return (
    <li className="flex gap-3 py-4">
      <DishArt category={product.category} seed={product.number ?? 3} className="size-16 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-display text-lg font-semibold leading-tight">{product.name}</p>
          <p className="shrink-0 text-sm font-semibold tabular-nums">{kr(total)}</p>
        </div>
        {details.length > 0 && <p className="mt-0.5 text-xs leading-relaxed text-muted">{details.join(" · ")}</p>}
        {line.note && <p className="mt-0.5 text-xs italic leading-relaxed text-muted">”{line.note}”</p>}
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center rounded-full border border-line bg-white" role="group" aria-label={`Antal ${product.name}`}>
            <button
              type="button"
              onClick={() => cartStore.setQuantity(line.key, line.quantity - 1)}
              aria-label={line.quantity === 1 ? `Ta bort ${product.name}` : `Minska antal ${product.name}`}
              className="grid size-11 place-items-center rounded-full transition hover:bg-cream"
            >
              <MinusIcon className="size-4" />
            </button>
            <output className="w-6 text-center text-sm font-semibold tabular-nums">{line.quantity}</output>
            <button
              type="button"
              onClick={() => cartStore.setQuantity(line.key, line.quantity + 1)}
              disabled={line.quantity >= MAX_LINE_QUANTITY}
              aria-label={`Öka antal ${product.name}`}
              className="grid size-11 place-items-center rounded-full transition hover:bg-cream disabled:opacity-35"
            >
              <PlusIcon className="size-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => cartStore.remove(line.key)}
            aria-label={`Ta bort ${product.name}`}
            className="grid size-11 place-items-center rounded-full text-muted transition hover:bg-cream hover:text-ember"
          >
            <TrashIcon className="size-5" />
          </button>
        </div>
      </div>
    </li>
  );
}

function Details({ subtotal, onBack }: { subtotal: number; onBack: () => void }) {
  const now = useNow();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pickup, setPickup] = useState("asap");

  const { slots, status } = useMemo(() => {
    if (now === null) return { slots: null, status: null };
    const date = new Date(now);
    return {
      slots: getPickupSlots(date, CURRENT_SEASON, {
        prepMinutes: PREP_MINUTES,
        lastBeforeClose: LAST_PICKUP_BEFORE_CLOSE,
        step: SLOT_STEP_MINUTES,
      }),
      status: getOpenStatus(date, CURRENT_SEASON),
    };
  }, [now]);

  // "As soon as possible" only exists while the kitchen is open; otherwise default to the first slot.
  const selectedPickup = pickup === "asap" && status && !status.isOpen ? (slots?.[0] ?? "") : pickup;

  const field =
    "mt-1 min-h-12 w-full rounded-xl border border-line bg-white px-4 text-sm placeholder:text-muted/70";

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="flex min-h-0 flex-1 flex-col"
      aria-describedby="payment-note"
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-ink"
        >
          <ArrowIcon className="size-4 rotate-180" /> Tillbaka till varukorgen
        </button>

        <label className="block text-sm font-semibold">
          Namn
          <input
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${field} font-normal`}
            placeholder="Förnamn Efternamn"
          />
        </label>
        <label className="block text-sm font-semibold">
          Telefonnummer
          <input
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={`${field} font-normal`}
            placeholder="070-123 45 67"
          />
        </label>

        <label className="block text-sm font-semibold">
          Hämtningstid
          <select
            value={selectedPickup}
            onChange={(e) => setPickup(e.target.value)}
            disabled={slots === null}
            className={`${field} font-normal`}
          >
            {slots === null && <option>Laddar tider…</option>}
            {slots !== null && slots.length > 0 && (
              <>
                {status?.isOpen && <option value="asap">Så snart som möjligt (ca {PREP_MINUTES} min)</option>}
                {slots.map((s) => (
                  <option key={s} value={s}>
                    Idag kl. {s}
                  </option>
                ))}
              </>
            )}
            {slots !== null && slots.length === 0 && <option value="">Inga fler hämttider idag</option>}
          </select>
          {status && !status.isOpen && <span className="mt-1 block text-xs font-normal text-muted">{status.label}</span>}
        </label>

        <div className="rounded-xl bg-cream px-4 py-3 text-sm">
          <p className="font-semibold">Hämtas hos oss</p>
          <p className="text-muted">
            {site.address.street}, {site.address.zip} {site.address.city}
          </p>
        </div>
      </div>

      <footer className="shrink-0 space-y-3 border-t border-line bg-white px-5 py-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted">Att betala</span>
          <span className="font-display text-3xl font-semibold tabular-nums">{kr(subtotal)}</span>
        </div>
        <button
          type="submit"
          disabled
          className="flex min-h-12 w-full items-center justify-center rounded-full bg-gold text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-45"
        >
          Fortsätt till betalning
        </button>
        <p id="payment-note" className="flex items-start gap-2 rounded-lg bg-cream px-3 py-2 text-xs leading-relaxed text-muted">
          <PhoneIcon className="mt-0.5 size-4 shrink-0 text-gold-deep" />
          <span>
            Betalning online öppnar snart. Vill du beställa nu? Ring{" "}
            <a href={site.phoneHref} className="font-semibold text-ink underline underline-offset-2">
              {site.phone}
            </a>
            .
          </span>
        </p>
      </footer>
    </form>
  );
}
