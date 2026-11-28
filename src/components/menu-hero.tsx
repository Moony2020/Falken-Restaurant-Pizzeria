"use client";

import Image from "next/image";
import { SearchIcon } from "@/components/icons";
import { OpenStatus } from "@/components/open-status";
import { useRestaurantSettings } from "@/lib/use-restaurant-settings";

interface MenuHeroProps {
  query: string;
  setQuery: (query: string) => void;
  disabled?: boolean;
}

export function MenuHero({ query, setQuery, disabled = false }: MenuHeroProps) {
  const { settings } = useRestaurantSettings();
  const heroSrc = settings.menuHeroImage || "/images/hero/Hero-image.webp";

  return (
    <section aria-labelledby="menu-hero-title" className="bg-[linear-gradient(to_bottom,var(--color-ink-2)_0%,var(--color-ivory)_100%)]">
      <div className="mx-auto w-full max-w-[1760px] px-3 pb-0 pt-2 sm:px-5 sm:pt-3 lg:px-7">
        <div className="relative isolate flex min-h-[23.5rem] items-center overflow-hidden rounded-[1.5rem] bg-[#1a1d22] px-5 py-6 ring-1 ring-white/10 sm:min-h-[25.5rem] sm:px-12 sm:py-10 lg:min-h-[calc(27rem+25px)] lg:px-14 xl:min-h-[calc(29rem+25px)] xl:px-16">
          {/* Background Hero Image */}
          <div className="pointer-events-none absolute inset-0 z-0 select-none overflow-hidden">
            <Image
              src={heroSrc}
              alt="Falken Meny & Beställ – Pizza, kebab och à la carte"
              fill
              priority
              quality={92}
              sizes="(min-width: 1760px) 1760px, 100vw"
              className="object-cover object-[78%_center] sm:object-[74%_center] lg:object-[68%_center] xl:object-[62%_center]"
            />

            {/* Subtle, soft ambient dark shadow on the left behind text allowing natural wood to shine */}
            <div className="hidden md:block absolute inset-0 bg-gradient-to-r from-black/30 via-black/10 via-30% to-transparent" />

            {/* Mobile overlay */}
            <div className="md:hidden absolute inset-0 bg-gradient-to-t from-black/35 via-black/15 to-transparent" />
          </div>

          {/* Hero Content on the left */}
          <div className="relative z-10 w-full max-w-xl animate-rise lg:max-w-2xl">
            {/* Eyebrow */}
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[#c5a059] sm:text-xs">
              AVHÄMTNING
            </p>

            {/* Main Title */}
            <h1 id="menu-hero-title" className="mt-2.5 font-display text-3xl min-[440px]:text-4xl sm:text-5xl md:text-6xl lg:text-[4.25rem] font-normal uppercase leading-[1.04] tracking-tight text-white drop-shadow-md">
              MENY &amp; BESTÄLL
            </h1>

            {/* Description */}
            <p className="mt-3.5 max-w-lg text-[0.95rem] leading-relaxed text-stone-300 sm:mt-4 sm:text-base">
              Välj din rätt, anpassa efter smak och hämta hos oss i Vintrosa.
              <br className="hidden sm:inline" /> Alla priser anges i kronor.
            </p>

            {/* Search Input */}
            <div className="relative mt-6 w-full max-w-md sm:mt-7 sm:max-w-lg">
              <label htmlFor="menu-search" className="sr-only">
                Sök i menyn
              </label>
              <SearchIcon
                className="pointer-events-none absolute left-4.5 top-1/2 z-10 size-5 -translate-y-1/2 text-stone-400"
                aria-hidden="true"
              />
              <input
                id="menu-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Sök rätt, ingrediens eller nummer"
                disabled={disabled}
                className="h-12 sm:h-13 w-full rounded-full border border-white/20 bg-stone-900/60 pl-12 pr-5 text-sm sm:text-[0.95rem] text-white placeholder:text-stone-400 backdrop-blur-md transition duration-200 focus:border-[#c5a059] focus:bg-stone-950/80 focus:outline-none focus:ring-1 focus:ring-[#c5a059] disabled:opacity-50"
              />
            </div>

            {/* Live Restaurant Open Status underneath search bar */}
            <div className="mt-5 flex items-center sm:mt-6">
              <OpenStatus tone="dark" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
