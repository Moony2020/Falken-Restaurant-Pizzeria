"use client";

import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { CartDrawer } from "@/components/order/cart-drawer";
import { ProductDialog } from "@/components/order/product-dialog";
import { Toast } from "@/components/order/toast";
import { ScrollObserver } from "@/components/scroll-observer";

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
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-4 focus-visible:z-[100] focus-visible:rounded-md focus-visible:bg-[#14161a] focus-visible:text-[#fbf9f5] focus-visible:border focus-visible:border-[#c5a059] focus-visible:px-4 focus-visible:py-1.5 focus-visible:text-xs focus-visible:font-semibold focus-visible:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c5a059]"
      >
        Hoppa till innehållet
      </a>
      <Suspense fallback={<div className="h-16 bg-ink-2 sm:h-20" aria-hidden="true" />}>
        <Header />
      </Suspense>
      <main id="innehall" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <Footer />
      <ProductDialog />
      <CartDrawer />
      <Toast />
      <ScrollObserver />
    </>
  );
}
