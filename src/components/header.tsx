"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { nav, site } from "@/data/site";
import { CartIcon, CloseIcon, MenuIcon, PhoneIcon } from "./icons";
import { Logo } from "./logo";
import { useOrder } from "./order/order-provider";

const emptySubscribe = () => () => {};

export function Header() {
  const pathname = usePathname();
  const { count, openCart } = useOrder();
  const [menuOpen, setMenuOpen] = useState(false);
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  const cartCount = mounted ? count : 0;

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 bg-ink-2 text-ivory">
      <div className="mx-auto flex h-16 w-full max-w-[1760px] items-center justify-between gap-3 pl-3 sm:pl-5 lg:pl-7 pr-1 sm:pr-2 lg:pr-7 sm:h-20">
        <Logo />

        <nav aria-label="Huvudmeny" className="hidden lg:block">
          <ul className="flex items-center gap-9">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={`text-[0.82rem] font-medium uppercase tracking-[0.14em] transition-colors hover:text-gold ${
                    isActive(item.href) ? "text-gold" : "text-ivory"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <Link
            href="/meny"
            className="hidden min-h-9 sm:min-h-9.5 items-center rounded-full bg-gold px-3.5 sm:px-4 text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-ink transition hover:bg-gold-light sm:inline-flex"
          >
            Beställ online
          </Link>
          <button
            type="button"
            onClick={openCart}
            aria-label={cartCount > 0 ? `Öppna varukorgen, ${cartCount} rätter` : "Öppna varukorgen"}
            className="relative grid size-11 place-items-center rounded-full transition hover:bg-ink-3"
          >
            <CartIcon className="size-6" />
            {cartCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute right-1 top-0 grid min-w-5 place-items-center rounded-full bg-gold px-1 text-[0.7rem] font-bold leading-5 text-ink"
              >
                {cartCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Stäng menyn" : "Öppna menyn"}
            className="grid size-11 place-items-center rounded-full transition hover:bg-ink-3 lg:hidden"
          >
            {menuOpen ? <CloseIcon className="size-6" /> : <MenuIcon className="size-6" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 top-16 z-30 bg-ink/75 backdrop-blur-md animate-fade sm:top-20 lg:hidden"
        />
      )}

      <nav
        id="mobile-nav"
        aria-label="Mobilmeny"
        hidden={!menuOpen}
        className="relative z-40 border-b border-t border-ink-3 bg-ink-2 shadow-2xl animate-rise lg:hidden"
      >
        <ul className="wrap py-4">
          {nav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setMenuOpen(false)}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`flex min-h-12 items-center text-sm font-medium uppercase tracking-[0.16em] transition-colors hover:text-gold ${
                  isActive(item.href) ? "text-gold" : "text-ivory"
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
          <li className="mt-2 flex gap-3 border-t border-ink-3 pt-4">
            <Link
              href="/meny"
              onClick={() => setMenuOpen(false)}
              className="inline-flex min-h-10.5 flex-1 items-center justify-center rounded-full bg-gold text-xs sm:text-sm font-semibold uppercase tracking-[0.08em] text-ink transition hover:bg-gold-light"
            >
              Beställ online
            </Link>
            <a
              href={site.phoneHref}
              aria-label={`Ring ${site.phone}`}
              className="grid size-12 place-items-center rounded-full border border-gold/50 text-gold transition hover:border-gold hover:bg-gold/10"
            >
              <PhoneIcon className="size-5" />
            </a>
          </li>
        </ul>
      </nav>
    </header>
  );
}
