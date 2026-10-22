"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { getProduct } from "@/data/menu";
import { cartStore, type CartLine } from "@/lib/cart-store";
import { lineTotal } from "@/lib/pricing";

type OrderContextValue = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  activeProductId: string | null;
  cartOpen: boolean;
  openProduct: (productId: string) => void;
  closeProduct: () => void;
  openCart: () => void;
  closeCart: () => void;
  notice: string | null;
  showNotice: (message: string) => void;
};

const OrderContext = createContext<OrderContextValue | null>(null);

export function OrderProvider({ children }: { children: ReactNode }) {
  const lines = useSyncExternalStore(cartStore.subscribe, cartStore.getSnapshot, cartStore.getServerSnapshot);
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const { count, subtotal } = useMemo(() => {
    let count = 0;
    let subtotal = 0;
    for (const l of lines) {
      const product = getProduct(l.productId);
      if (!product) continue;
      count += l.quantity;
      subtotal += lineTotal(product, { variantId: l.variantId, glutenFree: l.glutenFree, quantity: l.quantity });
    }
    return { count, subtotal };
  }, [lines]);

  const openProduct = useCallback((id: string) => {
    setCartOpen(false);
    setActiveProductId(id);
  }, []);
  const closeProduct = useCallback(() => setActiveProductId(null), []);
  const openCart = useCallback(() => {
    setActiveProductId(null);
    setCartOpen(true);
  }, []);
  const closeCart = useCallback(() => setCartOpen(false), []);

  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showNotice = useCallback((message: string) => {
    clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(null), 2800);
  }, []);

  const value = useMemo(
    () => ({
      lines,
      count,
      subtotal,
      activeProductId,
      cartOpen,
      openProduct,
      closeProduct,
      openCart,
      closeCart,
      notice,
      showNotice,
    }),
    [lines, count, subtotal, activeProductId, cartOpen, openProduct, closeProduct, openCart, closeCart, notice, showNotice],
  );

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>;
}

export function useOrder(): OrderContextValue {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error("useOrder must be used inside <OrderProvider>");
  return ctx;
}
