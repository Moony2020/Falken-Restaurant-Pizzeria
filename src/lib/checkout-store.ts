import type { Attempt, PublicOrder } from "./checkout.ts";

// Remembers (1) the idempotency key of the current checkout attempt and (2) the last order created,
// so a page reload shows the order that exists instead of inviting a second one.

/** `accessToken` proves to the server that this browser created the order; later pay/cancel calls send it. */
export type CheckoutState = {
  attempt: Attempt | null;
  order: PublicOrder | null;
  accessToken?: string;
  notice?: string;
  paymentMethod?: "card" | "cash";
};

const STORAGE_KEY = "falken.checkout.v1";
const EMPTY: CheckoutState = { attempt: null, order: null };
let state: CheckoutState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

const isAttempt = (v: unknown): v is Attempt =>
  !!v &&
  typeof v === "object" &&
  typeof (v as Attempt).key === "string" &&
  typeof (v as Attempt).fingerprint === "string";
const isOrder = (v: unknown): v is PublicOrder =>
  !!v &&
  typeof v === "object" &&
  typeof (v as PublicOrder).publicId === "string" &&
  Number.isInteger((v as PublicOrder).totalSek);

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const p = JSON.parse(raw) as Partial<CheckoutState>;
    state = {
      attempt: isAttempt(p.attempt) ? p.attempt : null,
      order: isOrder(p.order) ? p.order : null,
      accessToken:
        typeof p.accessToken === "string" ? p.accessToken : undefined,
      paymentMethod:
        p.paymentMethod === "cash" || p.paymentMethod === "card"
          ? p.paymentMethod
          : undefined,
    };
  } catch {
    // Unreadable storage: begin fresh.
  }
}

function commit(next: CheckoutState) {
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the in-memory state still protects this session.
  }
  listeners.forEach((l) => l());
}

export const checkoutStore = {
  subscribe(listener: () => void) {
    load();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): CheckoutState {
    load();
    return state;
  },
  getServerSnapshot(): CheckoutState {
    return EMPTY;
  },
  setAttempt(attempt: Attempt) {
    load();
    commit({ ...state, attempt });
  },
  /** An order exists: the attempt is finished, so the next order gets a new key. */
  setOrder(order: PublicOrder, accessToken?: string, paymentMethod?: "card" | "cash") {
    load();
    commit({ attempt: null, order, accessToken, paymentMethod });
  },
  /** A message about the payment of the current order (for example "payment is not available"). */
  setNotice(notice: string | null) {
    load();
    commit({ ...state, notice: notice ?? undefined });
  },
  dismissOrder() {
    load();
    commit({
      ...state,
      order: null,
      accessToken: undefined,
      notice: undefined,
    });
  },
};
