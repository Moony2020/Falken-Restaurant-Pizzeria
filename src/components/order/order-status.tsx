"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { mapsUrl, site } from "@/data/site";
import { checkoutStore } from "@/lib/checkout-store";
import {
  fetchOrderStatus,
  startCardPayment,
  startPaymentFailureSv,
  type OrderStatusView,
} from "@/lib/payments-client";
import { kr } from "@/lib/pricing";

// What the customer sees after paying (or not paying). It shows what the SERVER says about the order. Arriving here
// from Stripe is not treated as proof of payment: until the server reports PAID, the order is shown as waiting.

const POLL_MS = 3000;
const GIVE_UP_AFTER_MS = 3 * 60_000;
const PAID_STATES = new Set([
  "CONFIRMED",
  "ACKNOWLEDGED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "PICKED_UP",
]);

type View =
  | { kind: "loading" }
  | { kind: "ok"; order: OrderStatusView }
  | { kind: "denied" }
  | { kind: "trouble" };

export function OrderStatus() {
  const { publicId } = useParams<{ publicId: string }>();
  const checkout = useSyncExternalStore(
    checkoutStore.subscribe,
    checkoutStore.getSnapshot,
    checkoutStore.getServerSnapshot,
  );
  // The access token lives in this browser only. Another device or a cleared browser can't open the order.
  const token =
    checkout.order?.publicId === publicId ? checkout.accessToken : undefined;
  const [view, setView] = useState<View>({ kind: "loading" });
  const router = useRouter();
  // The return link from Stripe when the customer leaves without paying carries ?avbruten=1.
  const cancelled = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("avbruten") === "1",
    () => false,
  );
  const [slow, setSlow] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    // The HttpOnly order cookie is available after Stripe returns even if browser storage was cleared.
    let stop = false;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      const r = await fetchOrderStatus(publicId, token);
      if (stop) return;
      if (r.kind === "denied") return setView({ kind: "denied" });
      if (r.kind === "ok") {
        setView({ kind: "ok", order: r.order });
        if (r.order.status !== "PENDING_PAYMENT") return; // settled: stop asking
        if (Date.now() - startedAt > GIVE_UP_AFTER_MS) return setSlow(true);
      } else {
        setView((v) => (v.kind === "ok" ? v : { kind: "trouble" }));
      }
      timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [publicId, token]);

  const retryPayment = useCallback(async () => {
    if (!token || paying) return;
    setPaying(true);
    setNotice(null);
    const r = await startCardPayment(publicId, token);
    if (r.kind === "redirect") {
      window.location.assign(r.url);
      return;
    }
    setNotice(startPaymentFailureSv(r));
    setPaying(false);
  }, [publicId, token, paying]);

  if (view.kind === "denied") {
    return (
      <Card tone="neutral" title="Vi kan inte visa den här beställningen">
        <p>
          Beställningen visas bara i den webbläsare där den gjordes. Om du har
          betalat får du den ändå – ring oss på{" "}
          <a
            href={site.phoneHref}
            className="font-semibold underline underline-offset-2"
          >
            {site.phone}
          </a>{" "}
          och uppge ordernummer{" "}
          <span className="font-mono font-semibold">{publicId}</span>.
        </p>
        <Link
          href="/meny"
          className="mt-5 inline-flex min-h-11 items-center rounded-full bg-ink px-6 text-sm font-semibold text-ivory"
        >
          Till menyn
        </Link>
      </Card>
    );
  }

  if (view.kind === "loading")
    return <Card tone="neutral" title="Hämtar din beställning…" busy />;
  if (view.kind === "trouble") {
    return (
      <Card tone="neutral" title="Vi kunde inte hämta statusen just nu">
        <p>
          Vi försöker igen automatiskt. Är du osäker på om betalningen gick
          igenom? Ring oss på {site.phone}.
        </p>
      </Card>
    );
  }

  const { order } = view;
  const time = new Date(order.pickupAt).toLocaleTimeString("sv-SE", {
    timeZone: "Europe/Stockholm",
    hour: "2-digit",
    minute: "2-digit",
  });

  if (order.paymentMethod === "pay_on_pickup" && order.status !== "CANCELLED" && order.status !== "REFUNDED") {
    return (
      <ConfirmationCard
        order={order}
        time={time}
        payOnPickup
        onReturnToMenu={() => {
          checkoutStore.dismissOrder();
          router.push("/meny");
        }}
      />
    );
  }

  if (PAID_STATES.has(order.status)) {
    return (
      <ConfirmationCard
        order={order}
        time={time}
        onReturnToMenu={() => {
          checkoutStore.dismissOrder();
          router.push("/meny");
        }}
      />
    );
  }

  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    return (
      <Card
        tone="bad"
        title={
          order.status === "REFUNDED"
            ? "Beställningen är återbetald"
            : "Beställningen avbröts"
        }
      >
        <p>
          {order.status === "REFUNDED"
            ? "Pengarna är på väg tillbaka till dig."
            : "Betalningen kom inte in i tid, så beställningen avbröts. Har du ändå blivit debiterad? Ring oss så löser vi det."}{" "}
          <a
            href={site.phoneHref}
            className="font-semibold underline underline-offset-2"
          >
            {site.phone}
          </a>
        </p>
        <Link
          href="/meny"
          className="mt-5 inline-flex min-h-11 items-center rounded-full bg-ink px-6 text-sm font-semibold text-ivory"
        >
          Gör en ny beställning
        </Link>
      </Card>
    );
  }

  // Still PENDING_PAYMENT.
  return (
    <Card
      tone="wait"
      title={cancelled ? "Betalningen avbröts" : "Vi bekräftar din betalning…"}
      busy={!cancelled && !slow}
    >
      <p>
        {cancelled
          ? "Du lämnade betalningssidan utan att betala. Din beställning är sparad men inte bekräftad och skickas inte till köket förrän den är betald."
          : slow
            ? "Det tar längre tid än vanligt. Om du har betalat bekräftas beställningen så fort betalningen når oss – ring oss gärna om du är osäker."
            : "Det tar vanligtvis bara några sekunder. Lämna inte sidan om du precis har betalat."}
      </p>
      {notice && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-ember/40 bg-ember/5 p-3 text-sm"
        >
          {notice}
        </p>
      )}
      <Summary order={order} />
      {(cancelled || slow) && (
        <button
          type="button"
          onClick={retryPayment}
          disabled={paying}
          className="mt-6 inline-flex min-h-12 items-center rounded-full bg-gold px-7 text-sm font-semibold text-ink transition hover:bg-gold-light disabled:opacity-45"
        >
          {paying
            ? "Går till betalning…"
            : `Betala ${kr(order.totalSek)} med kort`}
        </button>
      )}
    </Card>
  );
}

const tones = {
  good: "border-emerald-600/40 bg-white",
  wait: "border-gold-deep/40 bg-cream",
  bad: "border-ember/40 bg-white",
  neutral: "border-line bg-white",
};

function Card({
  tone,
  title,
  busy,
  children,
}: {
  tone: keyof typeof tones;
  title: string;
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <section
      role="status"
      aria-live="polite"
      aria-busy={busy}
      className={`rounded-2xl border p-6 shadow-card sm:p-8 ${tones[tone]}`}
    >
      <h2 className="flex items-center gap-3 font-display text-3xl font-semibold">
        {busy && (
          <span
            aria-hidden="true"
            className="size-4 shrink-0 animate-pulse rounded-full bg-gold"
          />
        )}
        {title}
      </h2>
      <div className="mt-3 text-[0.95rem] leading-relaxed text-ink/80">
        {children}
      </div>
    </section>
  );
}

function Summary({ order, payOnPickup = false }: { order: OrderStatusView; payOnPickup?: boolean }) {
  return (
    <div className="mt-5">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">
        Ordernummer{" "}
        <span className="ml-1 font-mono text-base font-semibold tracking-wider text-ink">
          {order.publicId}
        </span>
      </p>
      {payOnPickup && (
        <p className="mt-2 text-sm font-medium text-gold-deep">Betalas vid avhämtning</p>
      )}
      <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-white px-4 text-sm">
        {order.items.map((i, idx) => (
          <li key={idx} className="flex justify-between gap-3 py-3">
            <div className="min-w-0">
              <p>
                {i.quantity} × {i.productNameSnapshot}
                {i.variantNameSnapshot !== "Standard"
                  ? ` (${i.variantNameSnapshot})`
                  : ""}
              </p>
              <OrderItemDetails item={i} />
            </div>
            <span className="shrink-0 tabular-nums">{kr(i.lineTotalSek)}</span>
          </li>
        ))}
        <li className="flex justify-between gap-3 py-3 font-semibold">
          <span>Totalt</span>
          <span className="tabular-nums">{kr(order.totalSek)}</span>
        </li>
      </ul>
    </div>
  );
}

function ConfirmationCard({
  order,
  time,
  payOnPickup = false,
  onReturnToMenu,
}: {
  order: OrderStatusView;
  time: string;
  payOnPickup?: boolean;
  onReturnToMenu: () => void;
}) {
  const dishCount = order.items.reduce((total, item) => total + item.quantity, 0);
  const heading = payOnPickup ? "Beställning mottagen" : "Betalning bekräftad";

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-line bg-white shadow-card">
      <header className="border-b border-line bg-cream/60 px-5 py-7 text-center sm:px-8 sm:py-8">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-gold text-xl font-bold text-ink" aria-hidden="true">✓</span>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
          Falken Restaurang & Pizzeria
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">{heading}</h1>
        <p className="mx-auto mt-3 max-w-2xl leading-relaxed text-ink/75">
          {payOnPickup
            ? "Köket har fått din beställning. Du betalar kontant eller med kort i kassan när du hämtar den."
            : "Din beställning är mottagen och skickad till köket. Vi ses vid din hämtningstid."}
        </p>
      </header>

      <div className="p-5 sm:p-8">
        <dl className="grid overflow-hidden rounded-2xl border border-line bg-cream/45 sm:grid-cols-2 lg:grid-cols-4">
          <ConfirmationFact label="Ordernummer" value={order.publicId} mono />
          <ConfirmationFact label="Hämtningstid" value={`Idag kl. ${time}`} />
          <ConfirmationFact label="Hämtningsplats" value={`${site.address.street}, ${site.address.zip} ${site.address.city}`} />
          <ConfirmationFact label={payOnPickup ? "Att betala i kassan" : "Betalt"} value={kr(order.totalSek)} emphasized />
        </dl>

        <section className="mt-6 rounded-2xl border border-line p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
            <h2 className="font-display text-2xl font-semibold">Din beställning</h2>
            <p className="text-sm text-muted">{dishCount} {dishCount === 1 ? "rätt" : "rätter"}</p>
          </div>
          <ul className="divide-y divide-line">
            {order.items.map((item, index) => (
              <li key={index} className="flex gap-4 py-4 last:pb-1">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">
                    {item.quantity} × {item.productNameSnapshot}
                    {item.variantNameSnapshot !== "Standard" ? ` (${item.variantNameSnapshot})` : ""}
                  </p>
                  <OrderItemDetails item={item} />
                </div>
                <span className="shrink-0 font-semibold tabular-nums">{kr(item.lineTotalSek)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
            <span className="font-semibold">Totalt</span>
            <span className="font-display text-3xl text-gold-deep">{kr(order.totalSek)}</span>
          </div>
        </section>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onReturnToMenu}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-gold px-6 text-sm font-semibold text-ink transition hover:bg-gold-light"
          >
            Tillbaka till menyn
          </button>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-gold-deep/50 px-6 text-sm font-semibold text-ink transition hover:bg-cream"
          >
            Visa karta <span aria-hidden="true" className="ml-2">↗</span>
          </a>
        </div>
      </div>
    </section>
  );
}

function ConfirmationFact({
  label,
  value,
  mono = false,
  emphasized = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  emphasized?: boolean;
}) {
  return (
    <div className="border-b border-line p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className={`mt-1 text-sm font-semibold leading-snug text-ink ${mono ? "font-mono tracking-wide" : ""} ${emphasized ? "font-display text-2xl text-gold-deep" : ""}`}>{value}</dd>
    </div>
  );
}

function OrderItemDetails({
  item,
}: {
  item: OrderStatusView["items"][number];
}) {
  const additions = item.modifiersSnapshot.filter((modifier) => modifier.quantity > 0);
  if (additions.length === 0 && item.removedIngredients.length === 0 && !item.note) return null;

  return (
    <div className="mt-1.5 space-y-1 text-sm leading-snug text-muted">
      {additions.map((modifier) => {
        const quantity = modifier.quantity * item.quantity;
        const amount = modifier.priceSek * quantity;
        return (
          <p key={modifier.labelSv}>
            + {modifier.labelSv}{quantity > 1 ? ` ×${quantity}` : ""} ({kr(amount)})
          </p>
        );
      })}
      {item.removedIngredients.length > 0 && <p>Utan: {item.removedIngredients.join(", ")}</p>}
      {item.note && <p>Önskemål: {item.note}</p>}
    </div>
  );
}
