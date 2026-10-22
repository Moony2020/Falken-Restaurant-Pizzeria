"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { nav, site } from "@/data/site";
import { CartIcon, CloseIcon, MenuIcon, PhoneIcon } from "./icons";
import { Logo } from "./logo";
import { useOrder } from "./order/order-provider";

export function Header() {
  const pathname = usePathname();
  const { count, openCart } = useOrder();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-40 bg-ink/95 text-ivory backdrop-blur">
      <div className="wrap flex h-20 items-center justify-between gap-4 sm:h-24">
        <Logo />

        <nav aria-label="Huvudmeny" className="hidden md:block">
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

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/meny"
            className="hidden min-h-11 items-center rounded-full bg-gold px-6 text-[0.8rem] font-semibold uppercase tracking-[0.1em] text-ink transition hover:bg-gold-light sm:inline-flex"
          >
            Beställ online
          </Link>
          <button
            type="button"
            onClick={openCart}
            aria-label={count > 0 ? `Öppna varukorgen, ${count} rätter` : "Öppna varukorgen"}
            className="relative grid size-11 place-items-center rounded-full transition hover:bg-ink-3"
          >
            <CartIcon className="size-6" />
            {count > 0 && (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-gold px-1 text-[0.7rem] font-bold leading-5 text-ink"
              >
                {count}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Stäng menyn" : "Öppna menyn"}
            className="grid size-11 place-items-center rounded-full transition hover:bg-ink-3 md:hidden"
          >
            {menuOpen ? <CloseIcon className="size-6" /> : <MenuIcon className="size-6" />}
          </button>
        </div>
      </div>

      <nav
        id="mobile-nav"
        aria-label="Mobilmeny"
        hidden={!menuOpen}
        className="border-t border-ink-3 bg-ink-2 md:hidden"
      >
        <ul className="wrap py-3">
          {nav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setMenuOpen(false)}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`flex min-h-12 items-center text-sm font-medium uppercase tracking-[0.16em] ${
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
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-gold text-sm font-semibold uppercase tracking-[0.1em] text-ink"
            >
              Beställ online
            </Link>
            <a
              href={site.phoneHref}
              aria-label={`Ring ${site.phone}`}
              className="grid size-12 place-items-center rounded-full border border-gold/50 text-gold"
            >
              <PhoneIcon className="size-5" />
            </a>
          </li>
        </ul>
      </nav>
    </header>
  );
}
