"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  CURRENT_SEASON,
  LAST_PICKUP_BEFORE_CLOSE,
  PREP_MINUTES,
  SLOT_STEP_MINUTES,
  site,
} from "@/data/site";
import {
  priceChanges,
  toPayloadItems,
} from "@/lib/cart-api";
import { refreshCartPricing, useCartPricing } from "@/lib/cart-pricing-store";
import { cartStore, type CartLine } from "@/lib/cart-store";
import { checkoutStore } from "@/lib/checkout-store";
import { startCardPayment, startPaymentFailureSv } from "@/lib/payments-client";
import {
  fingerprintOf,
  orderFailureSv,
  resolveAttempt,
  submitOrder,
  type OrderResult,
  type PublicOrder,
} from "@/lib/checkout";
import { getOpenStatus, getPickupSlotInstants } from "@/lib/hours";
import { kr } from "@/lib/pricing";
import { useNow } from "@/lib/use-now";
import {
  ArrowIcon,
  CartIcon,
  CloseIcon,
  ClockIcon,
  VisaBadge,
  MastercardBadge,
  PayPalLogo,
} from "@/components/icons";
import { useOrder } from "./order-provider";

const PHONE_PATTERN = /^([0+][0-9\s-]{6,20}|0[0-9\s-]{6,20})$/;

type CheckoutDraft = {
  name?: string;
  phone?: string;
  pickup?: string;
  note?: string;
  paymentMethod?: "cash" | "card";
};

const DRAFT_STORAGE_KEY = "falken.checkout.draft.v1";

function readDraft(): CheckoutDraft {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDraft(draft: CheckoutDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {}
}

function clearDraft() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {}
}

const emptySubscribe = () => () => {};

export function CheckoutPageView() {
  const { lines } = useOrder();
  const router = useRouter();
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const checkout = useSyncExternalStore(
    checkoutStore.subscribe,
    checkoutStore.getSnapshot,
    checkoutStore.getServerSnapshot,
  );
  const pricing = useCartPricing();
  const changes = pricing.status === "ready" ? priceChanges(lines, pricing.lines) : [];
  const canPay = pricing.status === "ready" && changes.length === 0;
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">(() => {
    const draft = readDraft();
    return draft.paymentMethod === "card" || draft.paymentMethod === "cash"
      ? draft.paymentMethod
      : "cash";
  });

  const handlePaymentMethodChange = (m: "cash" | "card") => {
    setPaymentMethod(m);
    const draft = readDraft();
    saveDraft({ ...draft, paymentMethod: m });
  };

  // While SSR is running or before client hydration completes, show a matching layout skeleton
  // so the user NEVER sees a flash of "Din varukorg är tom" on page refresh.
  if (!mounted) {
    return (
      <section className="min-h-[calc(100vh-14rem)] bg-ivory py-8 text-ink sm:py-12">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-center gap-2">
            <span className="h-4 w-32 animate-pulse rounded bg-cream" />
          </div>
          <div className="mb-8">
            <div className="h-3.5 w-24 animate-pulse rounded bg-cream" />
            <div className="mt-2 h-10 w-44 animate-pulse rounded bg-cream" />
          </div>
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-10 xl:gap-14">
            <div className="space-y-6 lg:col-span-7">
              <div className="h-72 animate-pulse rounded-2xl border border-line bg-white/70" />
              <div className="h-64 animate-pulse rounded-2xl border border-line bg-white/70" />
            </div>
            <div className="lg:col-span-5">
              <div className="h-96 animate-pulse rounded-2xl border border-line bg-white/70" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (checkout.order) {
    return (
      <section className="min-h-[70vh] bg-ivory py-10 sm:py-16">
        <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          <OrderCreatedView
            order={checkout.order}
            token={checkout.accessToken}
            notice={checkout.notice}
            paymentMethod={checkout.paymentMethod}
            onClose={() => router.push("/meny")}
          />
        </div>
      </section>
    );
  }

  if (lines.length === 0) {
    return (
      <section className="min-h-[70vh] bg-ivory py-16 sm:py-24">
        <div className="mx-auto max-w-xl rounded-2xl border border-line bg-white p-8 text-center shadow-card sm:p-12">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-cream text-gold-deep">
            <CartIcon className="size-7" />
          </span>
          <h1 className="mt-4 font-display text-3xl font-semibold sm:text-4xl text-ink">
            Din varukorg är tom
          </h1>
          <p className="mt-3 text-muted">
            Välj något gott från menyn innan du går vidare till kassan.
          </p>
          <Link
            href="/meny"
            className="mt-6 inline-flex min-h-12 items-center rounded-full bg-gold px-8 text-sm font-semibold text-ink transition hover:bg-gold-light"
          >
            Se menyn
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-ivory text-ink min-h-[calc(100vh-14rem)] py-8 sm:py-12">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Back navigation */}
        <div className="mb-6">
          <Link
            href="/meny"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted transition hover:text-ink"
          >
            <ArrowIcon className="size-4 rotate-180 text-gold-deep" />
            Tillbaka till menyn
          </Link>
        </div>

        {/* Header */}
        <div className="mb-8 sm:mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold-deep">Avhämtning</p>
          <h1 className="mt-1 font-display text-4xl font-medium tracking-tight text-ink sm:text-5xl">Kassan</h1>
        </div>

        {/* Two-Column Grid */}
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-10 xl:gap-14">
          {/* Left Column (7 cols): Steps & Form */}
          <div className="lg:col-span-7 xl:col-span-7">
            <CheckoutForm
              lines={lines}
              totalSek={canPay ? pricing.totalSek : null}
              paymentMethod={paymentMethod}
              onPaymentMethodChange={handlePaymentMethodChange}
              onBack={() => router.push("/meny")}
            />
          </div>

          {/* Right Column (5 cols): Sticky Order Summary */}
          <div className="lg:sticky lg:top-28 lg:col-span-5 xl:col-span-5">
            <aside aria-label="Beställningsöversikt" className="overflow-hidden rounded-2xl border border-line bg-white p-6 shadow-card sm:p-7">
              <div className="flex items-center justify-between border-b border-line pb-4">
                <h2 className="font-display text-2xl font-semibold text-ink">Din Beställning</h2>
                <span className="rounded-full bg-cream px-3 py-1 text-xs font-semibold text-gold-deep border border-line">
                  {lines.reduce((acc, l) => acc + l.quantity, 0)} {lines.reduce((acc, l) => acc + l.quantity, 0) === 1 ? "rätt" : "rätter"}
                </span>
              </div>

              {/* Pickup info box */}
              <div className="my-5 rounded-xl border border-line bg-cream/60 p-4 text-xs space-y-2 text-ink">
                <div className="flex items-center justify-between">
                  <span className="text-muted">Sätt:</span>
                  <span className="font-semibold text-gold-deep">Hämta själv</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Plats:</span>
                  <span className="font-medium text-ink">{site.address.street}, {site.address.zip} {site.address.city}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Tillagningstid:</span>
                  <span className="font-medium text-ink">ca 15–25 minuter</span>
                </div>
              </div>

              {/* Items List */}
              {pricing.status === "ready" ? (
                <ul className="divide-y divide-line max-h-[360px] overflow-y-auto pr-1">
                  {pricing.lines.map((line, index) => (
                    <li key={`${line.productSlug}-${index}`} className="flex items-start justify-between gap-4 py-3.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">
                          <span className="font-semibold text-gold-deep">{line.quantity} ×</span> {line.productNameSnapshot}
                          {line.variantNameSnapshot !== "Standard" && (
                            <span className="text-xs text-muted"> ({line.variantNameSnapshot})</span>
                          )}
                        </p>
                        {(line.modifiersSnapshot.length > 0 || line.removedIngredients.length > 0) && (
                          <ul className="mt-1 space-y-0.5 text-xs text-muted">
                            {line.modifiersSnapshot.map((mod) => (
                              <li key={mod.modifierSlug} className="text-gold-deep">
                                + {mod.quantity > 1 ? `${mod.quantity} × ` : ""}{mod.labelSv} ({kr(mod.priceSek * mod.quantity)})
                              </li>
                            ))}
                            {line.removedIngredients.length > 0 && (
                              <li className="text-muted/80">Utan: {line.removedIngredients.join(", ")}</li>
                            )}
                          </ul>
                        )}
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                        {kr(line.lineTotalSek)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="py-6 text-center text-sm text-muted">
                  Räknar ut pris…
                </div>
              )}

              {/* Price Breakdown */}
              <div className="mt-5 border-t border-line pt-4 space-y-2 text-sm">
                <div className="flex justify-between text-muted">
                  <span>Delsumma</span>
                  <span className="tabular-nums font-medium text-ink">
                    {pricing.status === "ready" ? kr(pricing.totalSek) : "–"}
                  </span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Avhämtning</span>
                  <span className="font-semibold text-gold-deep">0 KR</span>
                </div>
                <div className="flex items-baseline justify-between border-t border-line pt-3">
                  <span className="text-base font-medium text-ink">Totalt</span>
                  <span className="font-display text-3xl font-bold tabular-nums text-gold-deep">
                    {pricing.status === "ready" ? kr(pricing.totalSek) : "–"}
                  </span>
                </div>
              </div>

              {/* CTA placed on the right column */}
              <div className="mt-6">
                <button
                  type="submit"
                  form="checkout-form"
                  disabled={!canPay}
                  className="flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-gold px-6 text-sm font-semibold uppercase tracking-[0.08em] text-ink shadow-sm transition-all hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {paymentMethod === "cash"
                    ? "Bekräfta beställning"
                    : "Gå till betalning"}
                  <ArrowIcon className="size-4" />
                </button>
              </div>

              {/* Secure guarantee note */}
              <p className="mt-4 text-center text-xs leading-relaxed text-muted">
                {paymentMethod === "cash"
                  ? "Du betalar kontant eller med kort när du hämtar maten."
                  : "Kortbetalning hanteras krypterat och säkert via Stripe."}
              </p>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}

function CheckoutForm({
  lines,
  totalSek,
  paymentMethod,
  onPaymentMethodChange,
  onBack,
}: {
  lines: CartLine[];
  totalSek: number | null;
  paymentMethod: "cash" | "card";
  onPaymentMethodChange: (m: "cash" | "card") => void;
  onBack: () => void;
}) {
  const now = useNow();
  const checkout = useSyncExternalStore(
    checkoutStore.subscribe,
    checkoutStore.getSnapshot,
    checkoutStore.getServerSnapshot,
  );
  const [name, setName] = useState(() => readDraft().name ?? "");
  const [phone, setPhone] = useState(() => readDraft().phone ?? "");
  const [pickup, setPickup] = useState(() => readDraft().pickup ?? "");
  const [note, setNote] = useState(() => readDraft().note ?? "");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<OrderResult | null>(null);
  const sending = useRef(false);

  // Auto-save form inputs so page refresh retains all typed values
  useEffect(() => {
    saveDraft({ name, phone, pickup, note, paymentMethod });
  }, [name, phone, pickup, note, paymentMethod]);

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

  const selectedPickup = slots?.some((s) => s.iso === pickup)
    ? pickup
    : (slots?.[0]?.iso ?? "");

  const nameError = name.trim().length === 0 ? "Fyll i ditt för- och efternamn." : null;
  const phoneError = !PHONE_PATTERN.test(phone.trim())
    ? "Fyll i ett giltigt telefonnummer (t.ex. 070-123 45 67)."
    : null;
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

    if (result.kind === "created" || result.kind === "replayed") {
      clearDraft();
      cartStore.clear();
      checkoutStore.setOrder(result.order, result.accessToken, paymentMethod);

      if (paymentMethod === "card") {
        const pay = result.accessToken
          ? await startCardPayment(result.order.publicId, result.accessToken)
          : ({ kind: "unavailable" } as const);
        if (pay.kind === "redirect") {
          window.location.assign(pay.url);
          return;
        }
        checkoutStore.setNotice(startPaymentFailureSv(pay));
        sending.current = false;
        setSubmitting(false);
        return;
      }

      // Cash payment on pickup: order created directly without redirecting
      sending.current = false;
      setSubmitting(false);
      return;
    }

    sending.current = false;
    setSubmitting(false);
    if (result.kind === "price_changed" || result.kind === "issues") {
      refreshCartPricing();
      onBack();
    }
    setFailure(result);
  };

  const inputClass =
    "mt-1.5 min-h-12 w-full rounded-xl border border-line bg-white px-4 text-sm text-ink placeholder:text-muted/60 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold transition";

  return (
    <form id="checkout-form" onSubmit={submit} noValidate className="space-y-8">
      {failure && orderFailureSv(failure) && (
        <div role="alert" className="rounded-xl border border-ember/40 bg-ember/10 p-4 text-sm text-ember">
          {orderFailureSv(failure)}
        </div>
      )}

      {/* Step 1: Kontaktuppgifter */}
      <section className="rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8">
        <div className="flex items-center gap-3 border-b border-line pb-4">
          <span className="grid size-7 place-items-center rounded-full bg-gold text-xs font-bold text-ink">
            1
          </span>
          <h2 className="font-display text-2xl font-semibold text-ink">Kontaktuppgifter</h2>
        </div>

        <div className="mt-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Namn <span className="text-gold-deep">*</span>
            </label>
            <input
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={touched && !!nameError}
              className={`${inputClass} ${touched && nameError ? "border-ember ring-1 ring-ember" : ""}`}
              placeholder="Ditt för- och efternamn"
            />
            {touched && nameError && (
              <span className="mt-1 block text-xs text-ember">{nameError}</span>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Telefonnummer <span className="text-gold-deep">*</span>
            </label>
            <input
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={touched && !!phoneError}
              className={`${inputClass} ${touched && phoneError ? "border-ember ring-1 ring-ember" : ""}`}
              placeholder="070-123 45 67"
            />
            {touched && phoneError && (
              <span className="mt-1 block text-xs text-ember">{phoneError}</span>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Hämtningstid <span className="text-gold-deep">*</span>
            </label>
            <div className="relative mt-1.5">
              <select
                value={selectedPickup}
                onChange={(e) => setPickup(e.target.value)}
                disabled={slots === null || slots.length === 0}
                className={`${inputClass} appearance-none cursor-pointer pr-10`}
              >
                {slots === null && <option>Laddar tider…</option>}
                {slots?.map((s, i) => (
                  <option key={s.iso} value={s.iso} className="bg-white text-ink">
                    {i === 0 && status?.isOpen
                      ? `Så snart som möjligt · kl. ${s.label}`
                      : `Idag kl. ${s.label}`}
                  </option>
                ))}
                {slots !== null && slots.length === 0 && (
                  <option value="">Inga fler hämttider idag</option>
                )}
              </select>
              <ClockIcon className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-gold-deep" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Önskemål / Meddelande till köket (Valfritt)
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputClass}
              placeholder="T.ex. allergier eller extra servetter"
            />
          </div>
        </div>
      </section>

      {/* Step 2: Betalningsmetod */}
      <section className="rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8">
        <div className="flex items-center gap-3 border-b border-line pb-4">
          <span className="grid size-7 place-items-center rounded-full bg-gold text-xs font-bold text-ink">
            2
          </span>
          <h2 className="font-display text-2xl font-semibold text-ink">Betalning</h2>
        </div>

        <p className="mt-4 text-xs text-muted">
          Välj hur du vill betala för din beställning:
        </p>

        <div className="mt-4 space-y-3">
          {/* Option 1: Cash / Pay on Pickup */}
          <label
            onClick={() => onPaymentMethodChange("cash")}
            className={`relative flex cursor-pointer items-center justify-between rounded-xl border-2 p-4 transition ${
              paymentMethod === "cash"
                ? "border-gold bg-cream/40 shadow-sm"
                : "border-line bg-white hover:border-gold-deep/40"
            }`}
          >
            <div className="flex items-center gap-3.5">
              <input
                type="radio"
                name="payment_method"
                value="cash"
                checked={paymentMethod === "cash"}
                onChange={() => onPaymentMethodChange("cash")}
                className="size-4 accent-gold"
              />
              <div>
                <p className="text-sm font-semibold text-ink">Betala på plats (Kontant eller kort)</p>
                <p className="text-xs text-muted">Betala i restaurangen när du hämtar din mat hos oss på Skolgatan 4</p>
              </div>
            </div>
            <span className="rounded bg-cream px-2 py-0.5 text-xs font-semibold text-gold-deep border border-line shrink-0">
              I kassan
            </span>
          </label>

          {/* Option 2: Card / Stripe */}
          <label
            onClick={() => onPaymentMethodChange("card")}
            className={`relative flex cursor-pointer items-center justify-between rounded-xl border-2 p-4 transition ${
              paymentMethod === "card"
                ? "border-gold bg-cream/40 shadow-sm"
                : "border-line bg-white hover:border-gold-deep/40"
            }`}
          >
            <div className="flex items-center gap-3.5">
              <input
                type="radio"
                name="payment_method"
                value="card"
                checked={paymentMethod === "card"}
                onChange={() => onPaymentMethodChange("card")}
                className="size-4 accent-gold"
              />
              <div>
                <p className="text-sm font-semibold text-ink">Betala online med kort</p>
                <p className="text-xs text-muted">Visa, Mastercard • Snabb och säker betalning direkt via Stripe</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <VisaBadge className="h-6 w-auto" />
              <MastercardBadge className="h-6 w-auto" />
            </div>
          </label>

          {/* Option 3: PayPal (coming soon) */}
          <div className="relative flex cursor-not-allowed items-center justify-between rounded-xl border border-line/60 bg-cream/30 p-4 opacity-75">
            <div className="flex items-center gap-3.5">
              <input
                type="radio"
                name="payment_method"
                value="paypal"
                disabled
                className="size-4"
              />
              <div className="flex items-center gap-3">
                <PayPalLogo className="h-6 w-auto" />
                <span className="hidden sm:inline text-xs text-muted">• Snabbt och säkert via PayPal</span>
              </div>
            </div>
            <span className="rounded-full bg-cream px-2.5 py-0.5 text-[11px] font-medium text-muted border border-line shrink-0">
              kommer snart
            </span>
          </div>
        </div>

        {/* Trust Badges */}
        <div className="mt-8 grid grid-cols-3 gap-3 border-t border-line pt-6 text-center">
          <div className="rounded-xl border border-line bg-cream/40 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gold-deep">Säker hantering</p>
            <p className="mt-0.5 text-[10px] text-muted">256-bit SSL</p>
          </div>
          <div className="rounded-xl border border-line bg-cream/40 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gold-deep">Valfri betalning</p>
            <p className="mt-0.5 text-[10px] text-muted">Kort eller på plats</p>
          </div>
          <div className="rounded-xl border border-line bg-cream/40 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gold-deep">Färsk Garanti</p>
            <p className="mt-0.5 text-[10px] text-muted">Lagas vid beställning</p>
          </div>
        </div>
      </section>

      {/* Mobile Submit Button (Visible on small screens) */}
      <div className="block lg:hidden">
        <button
          type="submit"
          disabled={submitting || totalSek === null}
          aria-busy={submitting}
          className="flex min-h-13 w-full items-center justify-center rounded-xl bg-gold text-sm font-semibold uppercase tracking-wider text-ink transition hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-45 shadow-sm"
        >
          {submitting
            ? "Behandlar beställning…"
            : paymentMethod === "cash"
            ? `Bekräfta beställning · ${totalSek ? kr(totalSek) : ""}`
            : `Gå till kortbetalning · ${totalSek ? kr(totalSek) : ""}`}
        </button>
      </div>
    </form>
  );
}

function OrderCreatedView({
  order,
  token,
  notice,
  paymentMethod,
  onClose,
}: {
  order: PublicOrder;
  token?: string;
  notice?: string;
  paymentMethod?: "card" | "cash";
  onClose: () => void;
}) {
  const [paying, setPaying] = useState(false);
  const isCash = paymentMethod === "cash";
  const paymentNeedsAttention = Boolean(notice);

  const pay = async () => {
    if (paying) return;
    setPaying(true);
    checkoutStore.setNotice(null);
    const r = await startCardPayment(order.publicId, token);
    if (r.kind === "redirect") {
      window.location.assign(r.url);
      return;
    }
    checkoutStore.setNotice(startPaymentFailureSv(r));
    setPaying(false);
  };

  const time = new Date(order.pickupAt).toLocaleTimeString("sv-SE", {
    timeZone: "Europe/Stockholm",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      <header className="flex shrink-0 items-center justify-between border-b border-line bg-ink px-6 py-5 text-ivory">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gold">Falken Restaurang & Pizzeria</p>
          <h2 className="mt-0.5 font-display text-2xl font-medium">Beställning mottagen</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Stäng"
          className="grid size-11 place-items-center rounded-full transition hover:bg-ink-3 text-ivory"
        >
          <CloseIcon className="size-5" />
        </button>
      </header>

      <div className="space-y-6 p-6 sm:p-8">
        <div
          role="status"
          className={`rounded-xl border p-5 text-sm leading-relaxed ${
            isCash
              ? "border-gold-deep/30 bg-cream"
              : "border-gold-deep/30 bg-cream"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-full bg-gold text-xs font-bold text-ink">
              ✓
            </span>
            <p className="font-semibold text-ink">
              {isCash
                ? "Beställning bekräftad · Betala vid avhämtning"
                : paymentNeedsAttention
                ? "Betalningen behöver åtgärdas"
                : "Väntar på kortbetalning"}
            </p>
          </div>
          <p className="mt-2 text-ink/80">
            {isCash
              ? "Tack för din beställning! Köket tillagar nu din mat så den är nylagad och redo vid din hämtningstid. Du betalar kontant eller med kort i kassan."
              : "Din beställning är sparad. Betala med kort för att bekräfta den och skicka till köket."}
          </p>
        </div>

        {notice && (
          <p role="alert" className="rounded-xl border border-ember/40 bg-ember/10 p-4 text-sm text-ember">
            {notice}
          </p>
        )}

        <dl className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-cream/40 p-4 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted">Ordernummer</dt>
            <dd className="mt-1 font-mono text-lg font-bold text-ink">{order.publicId}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted">Önskad hämtning</dt>
            <dd className="mt-1 font-semibold text-ink">Idag kl. {time}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted">Plats</dt>
            <dd className="mt-1 text-ink">{site.address.street}, {site.address.zip} {site.address.city}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-muted">
              {isCash ? "Att betala i kassan" : "Att betala"}
            </dt>
            <dd className="mt-1 font-display text-xl font-bold text-gold-deep">{kr(order.totalSek)}</dd>
          </div>
        </dl>

        <ul className="divide-y divide-line rounded-xl border border-line bg-white px-4 text-sm">
          {order.items.map((i, idx) => (
            <li key={idx} className="flex justify-between py-3">
              <span>
                {i.quantity} × {i.productNameSnapshot}
                {i.variantNameSnapshot !== "Standard" ? ` (${i.variantNameSnapshot})` : ""}
              </span>
              <span className="font-semibold tabular-nums text-ink">{kr(i.lineTotalSek)}</span>
            </li>
          ))}
        </ul>
      </div>

      <footer className="space-y-3 border-t border-line bg-white p-6">
        {isCash ? (
          <>
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-12 w-full items-center justify-center rounded-xl bg-gold text-sm font-semibold text-ink transition hover:bg-gold-light"
            >
              Klart · Tillbaka till menyn
            </button>
            <button
              type="button"
              onClick={() => {
                clearDraft();
                checkoutStore.dismissOrder();
              }}
              className="flex min-h-11 w-full items-center justify-center rounded-xl border border-line text-sm font-medium text-muted transition hover:bg-cream hover:text-ink"
            >
              Gör en ny beställning
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={pay}
              disabled={paying}
              aria-busy={paying}
              className="flex min-h-12 w-full items-center justify-center rounded-xl bg-gold text-sm font-semibold text-ink transition hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-45"
            >
              {paying ? "Går till betalning…" : `Betala ${kr(order.totalSek)} med kort`}
            </button>
            <button
              type="button"
              onClick={() => {
                clearDraft();
                checkoutStore.dismissOrder();
              }}
              className="flex min-h-11 w-full items-center justify-center rounded-xl border border-line text-sm font-medium text-muted transition hover:bg-cream hover:text-ink"
            >
              Påbörja en ny beställning
            </button>
          </>
        )}
      </footer>
    </>
  );
}
