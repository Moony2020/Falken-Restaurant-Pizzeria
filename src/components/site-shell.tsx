"use client";

import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { CartDrawer } from "@/components/order/cart-drawer";
import { ProductDialog } from "@/components/order/product-dialog";
import { Toast } from "@/components/order/toast";

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  if (isAdmin) {
    return (
      <div className="flex min-h-dvh flex-col bg-[#faf8f3] text-[#14161a] antialiased">
        {children}
      </div>
    );
  }

  return (
    <>
      <a
        href="#innehall"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-gold focus:px-5 focus:py-3 focus:text-sm focus:font-semibold focus:text-ink"
      >
        Hoppa till innehållet
      </a>
      <Suspense fallback={<div className="h-16 bg-ink-2 sm:h-20" aria-hidden="true" />}>
        <Header />
      </Suspense>
      <main id="innehall" className="flex-1">
        {children}
      </main>
      <Footer />
      <ProductDialog />
      <CartDrawer />
      <Toast />
    </>
  );
}
