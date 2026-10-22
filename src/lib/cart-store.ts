// The cart lives in localStorage and holds only what the customer chose: slugs, sizes, extras, counts.
// It stores no prices that anyone relies on. Every price shown or charged is computed by the server.
// `seenTotalSek` is the last line total the customer saw, kept only to warn them if it later changes.

import type { IfUnavailable } from "../data/modifier-groups.ts";

export type CartModifier = { slug: string; quantity: number };

export type CartLine = {
  key: string;
  productSlug: string;
  variantId: string;
  removed: string[];
  modifiers: CartModifier[];
  note: string;
  ifUnavailable: IfUnavailable;
  quantity: number;
  seenTotalSek?: number;
};

export type NewLine = Omit<CartLine, "key" | "seenTotalSek">;

const STORAGE_KEY = "falken.cart.v2";
export const MAX_LINE_QUANTITY = 20;
const EMPTY: CartLine[] = [];

let lines: CartLine[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

export function lineKey(l: NewLine): string {
  const mods = [...l.modifiers].sort((a, b) => a.slug.localeCompare(b.slug)).map((m) => `${m.slug}:${m.quantity}`);
  return [l.productSlug, l.variantId, mods.join(","), [...l.removed].sort().join(","), l.note.trim().toLowerCase(), l.ifUnavailable].join("|");
}

const isSlug = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9-]{1,80}$/.test(v);

function isValid(l: unknown): l is CartLine {
  if (!l || typeof l !== "object") return false;
  const c = l as CartLine;
  return (
    isSlug(c.productSlug) &&
    isSlug(c.variantId) &&
    Array.isArray(c.removed) &&
    c.removed.every((r) => typeof r === "string") &&
    Array.isArray(c.modifiers) &&
    c.modifiers.every((m) => m && isSlug(m.slug) && Number.isInteger(m.quantity) && m.quantity > 0) &&
    typeof c.note === "string" &&
    (c.ifUnavailable === undefined || ["call", "remove_item", "cancel_order"].includes(c.ifUnavailable)) &&
    Number.isInteger(c.quantity) &&
    c.quantity > 0 &&
    (c.seenTotalSek === undefined || Number.isInteger(c.seenTotalSek))
  );
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Carts saved before the "if unavailable" choice existed get the default.
      lines = parsed
        .filter(isValid)
        .map((l) => ({ ...l, ifUnavailable: l.ifUnavailable ?? "call" }))
        .map((l) => ({ ...l, key: lineKey(l), quantity: Math.min(l.quantity, MAX_LINE_QUANTITY) }));
    }
  } catch {
    // Corrupt or blocked storage: start with an empty cart.
  }
}

function commit(next: CartLine[]) {
  lines = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or quota: the cart still works for this session.
  }
  listeners.forEach((l) => l());
}

export const cartStore = {
  subscribe(listener: () => void) {
    load();
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      loaded = false;
      lines = EMPTY;
      load();
      listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  },
  getSnapshot(): CartLine[] {
    load();
    return lines;
  },
  getServerSnapshot(): CartLine[] {
    return EMPTY;
  },
  add(input: NewLine) {
    load();
    const key = lineKey(input);
    const existing = lines.find((l) => l.key === key);
    if (existing) {
      // A different quantity means a different total, so the remembered total no longer applies.
      commit(
        lines.map((l) =>
          l.key === key ? { ...l, quantity: Math.min(l.quantity + input.quantity, MAX_LINE_QUANTITY), seenTotalSek: undefined } : l,
        ),
      );
    } else {
      commit([...lines, { ...input, key, quantity: Math.min(input.quantity, MAX_LINE_QUANTITY) }]);
    }
  },
  setQuantity(key: string, quantity: number) {
    if (quantity < 1) return cartStore.remove(key);
    commit(lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(quantity, MAX_LINE_QUANTITY), seenTotalSek: undefined } : l)));
  },
  remove(key: string) {
    commit(lines.filter((l) => l.key !== key));
  },
  clear() {
    commit(EMPTY);
  },
  /** Records the total the customer has now seen (first sighting, or after they approved a change). */
  setSeen(totals: Record<string, number>) {
    load();
    if (!lines.some((l) => totals[l.key] !== undefined && totals[l.key] !== l.seenTotalSek)) return;
    commit(lines.map((l) => (totals[l.key] !== undefined ? { ...l, seenTotalSek: totals[l.key] } : l)));
  },
};
