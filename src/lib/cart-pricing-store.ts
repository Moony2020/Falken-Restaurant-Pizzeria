import { useSyncExternalStore } from "react";
import { firstSightings, toPayloadItems, validateCart, type CartPricing } from "./cart-api.ts";
import { cartStore } from "./cart-store.ts";

// Keeps the server's price for the current cart. It runs while subscribed,
// re-validates a moment after the cart changes, caches the ready result across modal toggles,
// and cancels stale requests.

const IDLE: CartPricing = { status: "idle" };
let snapshot: CartPricing = IDLE;
const listeners = new Set<() => void>();
let unsubscribeCart: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let controller: AbortController | null = null;
let lastSignature = "";

function publish(next: CartPricing) {
  snapshot = next;
  listeners.forEach((l) => l());
}

async function run() {
  const lines = cartStore.getSnapshot();
  controller?.abort();
  if (lines.length === 0) {
    controller = null;
    return publish(IDLE);
  }
  const mine = new AbortController();
  controller = mine;
  publish({ status: "loading" });
  try {
    const result = await validateCart(lines, fetch, mine.signal);
    if (mine.signal.aborted) return;
    publish(result);
    if (result.status === "ready") {
      // The first price the customer sees for a line is remembered, so a later change can be flagged.
      const seen = firstSightings(lines, result.lines);
      if (Object.keys(seen).length > 0) cartStore.setSeen(seen);
    }
  } catch {
    // Aborted by a newer request: nothing to publish.
  }
}

/** The signature ignores `seenTotalSek` on purpose, so remembering a price never triggers another request. */
const signature = () => JSON.stringify(toPayloadItems(cartStore.getSnapshot()));

function onCartChange() {
  const sig = signature();
  if (sig === lastSignature && snapshot.status !== "idle") return;
  lastSignature = sig;
  clearTimeout(timer);
  const lines = cartStore.getSnapshot();
  if (lines.length === 0) {
    controller?.abort();
    controller = null;
    publish(IDLE);
    return;
  }
  timer = setTimeout(run, 150);
}

/** Forces a fresh validation now, for example after the server reports a changed total. */
export function refreshCartPricing() {
  clearTimeout(timer);
  lastSignature = signature();
  void run();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    unsubscribeCart = cartStore.subscribe(onCartChange);
    const sig = signature();
    if (sig !== lastSignature || snapshot.status === "idle") {
      onCartChange();
    }
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      unsubscribeCart?.();
      unsubscribeCart = null;
      clearTimeout(timer);
      controller?.abort();
      controller = null;
      // Keep snapshot and lastSignature so reopening drawer doesn't clear cache
    }
  };
}

/** Exposed so the store can be tested without React. */
export const cartPricingStore = {
  subscribe,
  getSnapshot: (): CartPricing => snapshot,
  getServerSnapshot: (): CartPricing => IDLE,
};

export function useCartPricing(): CartPricing {
  return useSyncExternalStore(cartPricingStore.subscribe, cartPricingStore.getSnapshot, cartPricingStore.getServerSnapshot);
}
