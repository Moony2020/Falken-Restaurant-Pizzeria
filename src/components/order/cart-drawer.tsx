"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CategoryId } from "@/data/menu";
import { CURRENT_SEASON, LAST_PICKUP_BEFORE_CLOSE, PREP_MINUTES, SLOT_STEP_MINUTES, site } from "@/data/site";
import { issueMessageSv, priceChanges, toPayloadItems, type CartIssue, type PriceChange } from "@/lib/cart-api";
import { refreshCartPricing, useCartPricing } from "@/lib/cart-pricing-store";
import { cartStore, MAX_LINE_QUANTITY, type CartLine } from "@/lib/cart-store";
import { checkoutStore } from "@/lib/checkout-store";
import { fingerprintOf, orderFailureSv, resolveAttempt, submitOrder, type OrderResult, type PublicOrder } from "@/lib/checkout";
import { getOpenStatus, getPickupSlotInstants } from "@/lib/hours";
import { useMenu } from "@/lib/menu-store";
import type { PublicMenu } from "@/lib/menu-types";
import { kr } from "@/lib/pricing";
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

const productFor = (menu: PublicMenu | null, slug: string) => menu?.products.find((p) => p.slug === slug);

function CartContents() {
  const { lines, count, closeCart } = useOrder();
  const checkout = useSyncExternalStore(checkoutStore.subscribe, checkoutStore.getSnapshot, checkoutStore.getServerSnapshot);
  const pricing = useCartPricing();
  const menuState = useMenu();
  const menu = menuState.status === "ready" ? menuState.menu : null;
  const [step, setStep] = useState<Step>("cart");

  if (checkout.order) {
    return <OrderCreated order={checkout.order} onClose={closeCart} />;
  }

  const changes = pricing.status === "ready" ? priceChanges(lines, pricing.lines) : [];
  const issues = pricing.status === "issues" ? pricing.issues : [];
  const canContinue = pricing.status === "ready" && changes.length === 0;

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
          <div className="min-h-0 flex-1 overflow-y-auto">
            {changes.length > 0 && pricing.status === "ready" && (
              <div role="alert" className="mx-5 mt-4 rounded-xl border border-ember/40 bg-ember/5 p-4 text-sm">
                <p className="font-semibold text-ember">Priserna har ändrats</p>
                <p className="mt-1 leading-relaxed text-ink/80">
                  Några priser skiljer sig från när du lade rätterna i varukorgen. Se de markerade raderna och godkänn det nya
                  totalbeloppet <strong>{kr(pricing.totalSek)}</strong> för att gå vidare.
                </p>
                <button
                  type="button"
                  onClick={() => cartStore.setSeen(Object.fromEntries(lines.map((l, i) => [l.key, pricing.lines[i].lineTotalSek])))}
                  className="mt-3 inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-xs font-semibold uppercase tracking-[0.1em] text-ivory"
                >
                  Godkänn nytt pris
                </button>
              </div>
            )}
            {issues.length > 0 && (
              <p role="alert" className="mx-5 mt-4 rounded-xl border border-ember/40 bg-ember/5 p-4 text-sm leading-relaxed text-ink/80">
                Någon rätt kan inte beställas just nu. Ta bort den markerade raden för att gå vidare.
              </p>
            )}
            <ul className="divide-y divide-line px-5">
              {lines.map((line, i) => (
                <CartItem
                  key={line.key}
                  line={line}
                  menu={menu}
                  priced={pricing.status === "ready" ? pricing.lines[i] : undefined}
                  loading={pricing.status === "loading" || pricing.status === "idle"}
                  issue={issues.find((x) => x.index === i)}
                  change={changes.find((c) => c.key === line.key)}
                />
              ))}
            </ul>
          </div>
          <footer className="shrink-0 space-y-3 border-t border-line bg-white px-5 py-4">
            <div className="flex items-baseline justify-between" aria-live="polite">
              <span className="text-sm text-muted">Summa</span>
              <TotalAmount pricing={pricing} />
            </div>
            {pricing.status === "error" && <PricingError reason={pricing.reason} />}
            <button
              type="button"
              disabled={!canContinue}
              onClick={() => setStep("details")}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-gold text-sm font-semibold text-ink transition hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-45"
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
        <Details
          lines={lines}
          totalSek={pricing.status === "ready" && canContinue ? pricing.totalSek : null}
          onBack={() => setStep("cart")}
        />
      )}
    </>
  );
}

function TotalAmount({ pricing }: { pricing: ReturnType<typeof useCartPricing> }) {
  if (pricing.status === "ready") {
    return <span className="font-display text-3xl font-semibold tabular-nums">{kr(pricing.totalSek)}</span>;
  }
  if (pricing.status === "issues") return <span className="text-sm text-muted">Åtgärda markerade rader</span>;
  if (pricing.status === "error") return <span className="text-sm text-muted">Kan inte beräknas</span>;
  return <span className="h-8 w-24 animate-pulse rounded bg-cream" role="status" aria-label="Räknar ut summan" />;
}

function PricingError({ reason }: { reason: "network" | "server" | "rate_limited" }) {
  const text =
    reason === "network"
      ? "Vi nådde inte servern, så priset kan inte räknas ut. Kontrollera uppkopplingen."
      : reason === "rate_limited"
        ? "För många förfrågningar. Vänta en stund och försök igen."
        : "Priset kunde inte räknas ut just nu.";
  return (
    <div role="alert" className="rounded-lg bg-cream px-3 py-2 text-xs leading-relaxed text-muted">
      {text}{" "}
      <button type="button" onClick={refreshCartPricing} className="font-semibold text-ink underline underline-offset-2">
        Försök igen
      </button>
    </div>
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

function CartItem({
  line,
  menu,
  priced,
  loading,
  issue,
  change,
}: {
  line: CartLine;
  menu: PublicMenu | null;
  priced: { productNameSnapshot: string; variantNameSnapshot: string; lineTotalSek: number; modifiersSnapshot: { labelSv: string }[] } | undefined;
  loading: boolean;
  issue: CartIssue | undefined;
  change: PriceChange | undefined;
}) {
  const product = productFor(menu, line.productSlug);
  const name = priced?.productNameSnapshot ?? product?.name ?? "Rätt";
  const variantLabel = priced?.variantNameSnapshot ?? product?.variants.find((v) => v.id === line.variantId)?.label;
  const extras = priced
    ? priced.modifiersSnapshot.map((m) => m.labelSv)
    : line.modifiers.map((m) => menu?.modifiers.find((x) => x.slug === m.slug)?.label ?? m.slug);
  const details = [
    product && product.variants.length > 1 ? variantLabel : null,
    ...extras,
    line.removed.length > 0 ? `Utan: ${line.removed.join(", ").toLowerCase()}` : null,
  ].filter(Boolean);

  return (
    <li className={`flex gap-3 py-4 ${issue ? "rounded-lg bg-ember/5" : ""}`}>
      <DishArt category={(product?.category ?? "pizza") as CategoryId} seed={product?.menuNumber ?? 3} className="size-16 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-display text-lg font-semibold leading-tight">{name}</p>
          <p className="shrink-0 text-sm font-semibold tabular-nums">
            {priced ? kr(priced.lineTotalSek) : loading ? <span className="inline-block h-4 w-14 animate-pulse rounded bg-cream align-middle" aria-hidden="true" /> : "–"}
          </p>
        </div>
        {details.length > 0 && <p className="mt-0.5 text-xs leading-relaxed text-muted">{details.join(" · ")}</p>}
        {line.note && <p className="mt-0.5 text-xs italic leading-relaxed text-muted">”{line.note}”</p>}
        {change && (
          <p className="mt-1 text-xs font-semibold text-ember">
            Priset har ändrats: <span className="line-through">{kr(change.from)}</span> → {kr(change.to)}
          </p>
        )}
        {issue && <p className="mt-1 text-xs font-semibold text-ember">{issueMessageSv(issue.code)}</p>}
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center rounded-full border border-line bg-white" role="group" aria-label={`Antal ${name}`}>
            <button
              type="button"
              onClick={() => cartStore.setQuantity(line.key, line.quantity - 1)}
              aria-label={line.quantity === 1 ? `Ta bort ${name}` : `Minska antal ${name}`}
              className="grid size-11 place-items-center rounded-full transition hover:bg-cream"
            >
              <MinusIcon className="size-4" />
            </button>
            <output className="w-6 text-center text-sm font-semibold tabular-nums">{line.quantity}</output>
            <button
              type="button"
              onClick={() => cartStore.setQuantity(line.key, line.quantity + 1)}
              disabled={line.quantity >= MAX_LINE_QUANTITY}
              aria-label={`Öka antal ${name}`}
              className="grid size-11 place-items-center rounded-full transition hover:bg-cream disabled:opacity-35"
            >
              <PlusIcon className="size-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => cartStore.remove(line.key)}
            aria-label={`Ta bort ${name}`}
            className="grid size-11 place-items-center rounded-full text-muted transition hover:bg-cream hover:text-ember"
          >
            <TrashIcon className="size-5" />
          </button>
        </div>
      </div>
    </li>
  );
}

const PHONE_PATTERN = /^[+0-9][0-9 ()-]{5,19}$/;

function Details({ lines, totalSek, onBack }: { lines: CartLine[]; totalSek: number | null; onBack: () => void }) {
  const now = useNow();
  const checkout = useSyncExternalStore(checkoutStore.subscribe, checkoutStore.getSnapshot, checkoutStore.getServerSnapshot);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pickup, setPickup] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<OrderResult | null>(null);
  const sending = useRef(false);

  const { slots, status } = useMemo(() => {
    if (now === null) return { slots: null, status: null };
    const date = new Date(now);
    return {
      slots: getPickupSlotInstants(date, CURRENT_SEASON, {
        prepMinutes: PREP_MINUTES,
        lastBeforeClose: LAST_PICKUP_BEFORE_CLOSE,
        step: SLOT_STEP_MINUTES,
      }),
      status: getOpenStatus(date, CURRENT_SEASON),
    };
  }, [now]);

  // The first available slot is the default until the customer picks another one.
  const selectedPickup = slots?.some((s) => s.iso === pickup) ? pickup : (slots?.[0]?.iso ?? "");

  const nameError = name.trim().length === 0 ? "Fyll i ditt namn." : null;
  const phoneError = !PHONE_PATTERN.test(phone.trim()) ? "Fyll i ett giltigt telefonnummer, till exempel 070-123 45 67." : null;
  const pickupError = !selectedPickup ? "Det finns inga fler hämttider idag." : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (sending.current || nameError || phoneError || pickupError || totalSek === null) return;

    sending.current = true;
    setSubmitting(true);
    setFailure(null);

    const contact = { name: name.trim(), phone: phone.trim() };
    const items = toPayloadItems(lines);
    // Same cart, contact and time reuse the same key, so a retry after a dropped connection can't create a second order.
    const attempt = resolveAttempt(
      checkout.attempt,
      fingerprintOf({ items, contact, pickupAt: selectedPickup, totalSek }),
      () => crypto.randomUUID(),
    );
    if (attempt !== checkout.attempt) checkoutStore.setAttempt(attempt);

    const result = await submitOrder({
      idempotencyKey: attempt.key,
      items,
      contact,
      pickupAt: selectedPickup,
      expectedTotalSek: totalSek,
    });

    sending.current = false;
    setSubmitting(false);

    if (result.kind === "created" || result.kind === "replayed") {
      cartStore.clear();
      checkoutStore.setOrder(result.order, result.accessToken);
      return;
    }
    if (result.kind === "price_changed" || result.kind === "issues") {
      refreshCartPricing();
      onBack();
    }
    setFailure(result);
  };

  const field = "mt-1 min-h-12 w-full rounded-xl border bg-white px-4 text-sm placeholder:text-muted/70";

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col" aria-describedby="payment-note">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowIcon className="size-4 rotate-180" /> Tillbaka till varukorgen
        </button>

        {failure && orderFailureSv(failure) && (
          <p role="alert" className="rounded-xl border border-ember/40 bg-ember/5 p-4 text-sm leading-relaxed text-ink/85">
            {orderFailureSv(failure)}
          </p>
        )}

        <label className="block text-sm font-semibold">
          Namn
          <input
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={touched && !!nameError}
            aria-describedby={touched && nameError ? "name-error" : undefined}
            className={`${field} font-normal ${touched && nameError ? "border-ember" : "border-line"}`}
            placeholder="Förnamn Efternamn"
          />
          {touched && nameError && (
            <span id="name-error" className="mt-1 block text-xs font-normal text-ember">
              {nameError}
            </span>
          )}
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
            aria-invalid={touched && !!phoneError}
            aria-describedby={touched && phoneError ? "phone-error" : undefined}
            className={`${field} font-normal ${touched && phoneError ? "border-ember" : "border-line"}`}
            placeholder="070-123 45 67"
          />
          {touched && phoneError && (
            <span id="phone-error" className="mt-1 block text-xs font-normal text-ember">
              {phoneError}
            </span>
          )}
        </label>

        <label className="block text-sm font-semibold">
          Hämtningstid
          <select
            value={selectedPickup}
            onChange={(e) => setPickup(e.target.value)}
            disabled={slots === null || slots.length === 0}
            className={`${field} border-line font-normal`}
          >
            {slots === null && <option>Laddar tider…</option>}
            {slots?.map((s, i) => (
              <option key={s.iso} value={s.iso}>
                {i === 0 && status?.isOpen ? `Så snart som möjligt · kl. ${s.label}` : `Idag kl. ${s.label}`}
              </option>
            ))}
            {slots !== null && slots.length === 0 && <option value="">Inga fler hämttider idag</option>}
          </select>
          {status && !status.isOpen && <span className="mt-1 block text-xs font-normal text-muted">{status.label}</span>}
          {touched && pickupError && <span className="mt-1 block text-xs font-normal text-ember">{pickupError}</span>}
        </label>

        <div className="rounded-xl bg-cream px-4 py-3 text-sm">
          <p className="font-semibold">Avhämtning hos oss</p>
          <p className="text-muted">
            {site.address.street}, {site.address.zip} {site.address.city}. Vi levererar inte hem.
          </p>
        </div>
      </div>

      <footer className="shrink-0 space-y-3 border-t border-line bg-white px-5 py-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted">Summa</span>
          <span className="font-display text-3xl font-semibold tabular-nums">{totalSek !== null ? kr(totalSek) : "–"}</span>
        </div>
        <button
          type="submit"
          disabled={submitting || totalSek === null}
          aria-busy={submitting}
          className="flex min-h-12 w-full items-center justify-center rounded-full bg-gold text-sm font-semibold text-ink transition hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-45"
        >
          {submitting ? "Skickar…" : "Skapa beställning (obetald)"}
        </button>
        <p id="payment-note" className="flex items-start gap-2 rounded-lg bg-cream px-3 py-2 text-xs leading-relaxed text-muted">
          <PhoneIcon className="mt-0.5 size-4 shrink-0 text-gold-deep" />
          <span>
            Betalning online öppnar snart. Beställningen skapas som <strong>obetald</strong> och bekräftas inte, och skickas inte till köket,
            förrän den är betald. Vill du beställa direkt? Ring{" "}
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

function OrderCreated({ order, onClose }: { order: PublicOrder; onClose: () => void }) {
  const time = new Date(order.pickupAt).toLocaleTimeString("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" });
  return (
    <>
      <header className="flex shrink-0 items-center justify-between border-b border-line bg-ink px-5 py-4 text-ivory">
        <h2 className="font-display text-2xl font-medium">Beställning skapad</h2>
        <button type="button" onClick={onClose} aria-label="Stäng" className="grid size-11 place-items-center rounded-full transition hover:bg-ink-3">
          <CloseIcon className="size-5" />
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-6">
        <div role="status" className="rounded-xl border border-gold-deep/40 bg-cream p-4 text-sm leading-relaxed">
          <p className="font-semibold">Väntar på betalning – inte bekräftad än</p>
          <p className="mt-1 text-ink/80">
            Din beställning är sparad men <strong>inte betald och inte bekräftad</strong>, och den har inte skickats till köket. Betalning online
            öppnar snart. Ring{" "}
            <a href={site.phoneHref} className="font-semibold underline underline-offset-2">
              {site.phone}
            </a>{" "}
            om du vill beställa direkt.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-muted">Ordernummer</dt>
            <dd className="mt-1 font-mono text-lg font-semibold tracking-wider">{order.publicId}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-muted">Status</dt>
            <dd className="mt-1 font-semibold">Väntar på betalning</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-muted">Önskad hämtning</dt>
            <dd className="mt-1 font-semibold">Idag kl. {time}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-muted">Att betala</dt>
            <dd className="mt-1 font-semibold tabular-nums">{kr(order.totalSek)}</dd>
          </div>
        </dl>
        <ul className="divide-y divide-line rounded-xl border border-line bg-white px-4 text-sm">
          {order.items.map((i, idx) => (
            <li key={idx} className="flex justify-between gap-3 py-3">
              <span>
                {i.quantity} × {i.productNameSnapshot}
                {i.variantNameSnapshot !== "Standard" ? ` (${i.variantNameSnapshot})` : ""}
              </span>
              <span className="tabular-nums">{kr(i.lineTotalSek)}</span>
            </li>
          ))}
        </ul>
      </div>
      <footer className="shrink-0 border-t border-line bg-white px-5 py-4">
        <button
          type="button"
          onClick={() => checkoutStore.dismissOrder()}
          className="flex min-h-12 w-full items-center justify-center rounded-full border border-ink/25 text-sm font-semibold transition hover:bg-ink hover:text-ivory"
        >
          Påbörja en ny beställning
        </button>
      </footer>
    </>
  );
}
