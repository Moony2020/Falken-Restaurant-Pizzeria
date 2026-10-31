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
import { cartStore, type CartLine } from "@/lib/cart-store";

import { useRestaurantStatus } from "@/lib/use-restaurant-status";

type OrderContextValue = {
  lines: CartLine[];
  count: number;
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
  const { status: restaurantStatus } = useRestaurantStatus();

  // Only a count is derived here. Prices come from the server (see cart-pricing-store).
  const count = useMemo(() => lines.reduce((sum, l) => sum + l.quantity, 0), [lines]);

  const openProduct = useCallback((id: string) => {
    if (restaurantStatus && !restaurantStatus.isOpen) {
      return;
    }
    setCartOpen(false);
    setActiveProductId(id);
  }, [restaurantStatus]);
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
      activeProductId,
      cartOpen,
      openProduct,
      closeProduct,
      openCart,
      closeCart,
      notice,
      showNotice,
    }),
    [lines, count, activeProductId, cartOpen, openProduct, closeProduct, openCart, closeCart, notice, showNotice],
  );

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>;
}

export function useOrder(): OrderContextValue {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error("useOrder must be used inside <OrderProvider>");
  return ctx;
}
