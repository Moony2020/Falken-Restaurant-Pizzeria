import { getProduct } from "../data/menu.ts";

// Tiny external store for the cart, persisted in localStorage.
// Consumed through useSyncExternalStore, so server render and hydration both see an empty cart.

export type CartLine = {
  key: string;
  productId: string;
  variantId: string;
  removed: string[];
  glutenFree: boolean;
  note: string;
  quantity: number;
};

export type NewLine = Omit<CartLine, "key">;

const STORAGE_KEY = "falken.cart.v1";
const MAX_QTY = 20;
const EMPTY: CartLine[] = [];

let lines: CartLine[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

export function lineKey(l: NewLine): string {
  return [l.productId, l.variantId, l.glutenFree ? "gf" : "", [...l.removed].sort().join(","), l.note.trim().toLowerCase()].join("|");
}

function isValid(l: unknown): l is CartLine {
  if (!l || typeof l !== "object") return false;
  const c = l as CartLine;
  const product = getProduct(c.productId);
  return (
    !!product &&
    product.variants.some((v) => v.id === c.variantId) &&
    Array.isArray(c.removed) &&
    typeof c.note === "string" &&
    Number.isInteger(c.quantity) &&
    c.quantity > 0
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
      lines = parsed.filter(isValid).map((l) => ({ ...l, key: lineKey(l), quantity: Math.min(l.quantity, MAX_QTY) }));
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
      commit(
        lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(l.quantity + input.quantity, MAX_QTY) } : l)),
      );
    } else {
      commit([...lines, { ...input, key, quantity: Math.min(input.quantity, MAX_QTY) }]);
    }
  },
  setQuantity(key: string, quantity: number) {
    if (quantity < 1) return cartStore.remove(key);
    commit(lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(quantity, MAX_QTY) } : l)));
  },
  remove(key: string) {
    commit(lines.filter((l) => l.key !== key));
  },
  clear() {
    commit(EMPTY);
  },
};

export const MAX_LINE_QUANTITY = MAX_QTY;
