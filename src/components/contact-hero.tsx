"use client";

import Image from "next/image";
import Link from "next/link";
import { PhoneIcon, PinIcon } from "@/components/icons";
import { OpenStatus } from "@/components/open-status";
import { useRestaurantSettings } from "@/lib/use-restaurant-settings";

export function ContactHero() {
  const { settings } = useRestaurantSettings();

  return (
    <section className="relative w-full overflow-hidden bg-[#0d0f12] py-20 sm:py-28 md:py-32 lg:py-36 min-h-[580px] sm:min-h-[660px] lg:min-h-[740px] flex items-center">
      {/* Background Hero Image - Full Width restaurant1.webp */}
      <div className="pointer-events-none absolute inset-0 select-none overflow-hidden">
        <Image
          src={settings.contactHeroImage || "/images/gallery/restaurant1.webp"}
          alt={`${settings.name || "Restaurang Falken"} interiör och matsal i Vintrosa`}
          fill
          priority
          quality={95}
          sizes="100vw"
          className="object-cover object-center"
        />

        {/* Gentle ambient base overlay - keeps restaurant interior warm and natural */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-transparent" />

        {/* Soft black shadow behind text on the left side to make text clear and legible */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 h-[58%] w-full max-w-4xl bg-gradient-to-r from-black/85 via-black/50 to-transparent [mask-image:linear-gradient(to_bottom,black_70%,transparent_100%)]"
        />

        {/* Soft edge gradient at the very top for seamless navbar transition */}
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/40 to-transparent" />
      </div>

      {/* Hero Content on the left */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="max-w-xl md:max-w-3xl lg:max-w-4xl">
          {/* Eyebrow */}
          <p className="text-[0.68rem] sm:text-[0.72rem] font-semibold uppercase tracking-[0.26em] text-[#c5a059] drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
            VÄLKOMMEN
          </p>

          {/* Main Title - refined size */}
          <h1 className="mt-2 font-display text-3xl sm:text-4xl lg:text-[2.75rem] font-normal uppercase leading-[1.1] tracking-tight text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.9)]">
            KONTAKT
          </h1>

          {/* Description - single line on desktop so 'frågor' is pushed up */}
          <p className="mt-2.5 max-w-none text-[0.98rem] leading-relaxed text-stone-100 sm:mt-3 sm:text-[1.05rem] lg:text-[1.1rem] md:whitespace-nowrap drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">
            Ring, mejla eller titta förbi – vi finns i Vintrosa och tar gärna emot dina frågor.
          </p>

          {/* Live Open Status */}
          <div className="mt-3 flex items-center">
            <OpenStatus tone="dark" />
          </div>

          {/* 3 Quick Contact Info Cards - In 1 row across all screen sizes (single row layout with compact width) */}
          <div className="mt-6 sm:mt-7 grid grid-cols-3 gap-2 sm:gap-3.5 max-w-xl">
            {/* Card 1: Adress */}
            <a
              href={settings.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ WebkitBackdropFilter: "blur(20px)" }}
              className="group flex flex-col sm:flex-row items-center sm:items-center text-center sm:text-left gap-1.5 sm:gap-3.5 rounded-xl sm:rounded-2xl border border-white/50 bg-white/[0.16] backdrop-blur-xl px-2 py-2.5 sm:p-3.5 shadow-[0_8px_32px_0_rgba(0,0,0,0.22)] transition-all duration-200 hover:border-white/70 hover:bg-white/[0.24] cursor-pointer"
              aria-label={`Adress: ${settings.address.street}, ${settings.address.zip} ${settings.address.city} (öppna vägbeskrivning)`}
            >
              <PinIcon className="size-4 sm:size-5 shrink-0 text-[#c5a059] transition-transform duration-200 group-hover:scale-110" />
              <div className="min-w-0">
                <span className="block text-[0.55rem] sm:text-[0.68rem] font-bold uppercase tracking-[0.12em] sm:tracking-[0.18em] text-[#c5a059]">
                  ADRESS
                </span>
                <span className="mt-0.5 block text-[0.68rem] sm:text-[0.82rem] font-medium leading-tight text-white transition-colors group-hover:text-[#f3ede2]">
                  {settings.address.street}
                  <span className="hidden sm:inline">, {settings.address.zip} {settings.address.city}</span>
                </span>
              </div>
            </a>

            {/* Card 2: Telefon */}
            <a
              href={settings.phoneHref}
              style={{ WebkitBackdropFilter: "blur(20px)" }}
              className="group flex flex-col sm:flex-row items-center sm:items-center text-center sm:text-left gap-1.5 sm:gap-3.5 rounded-xl sm:rounded-2xl border border-white/50 bg-white/[0.16] backdrop-blur-xl px-2 py-2.5 sm:p-3.5 shadow-[0_8px_32px_0_rgba(0,0,0,0.22)] transition-all duration-200 hover:border-white/70 hover:bg-white/[0.24] cursor-pointer"
              aria-label={`Telefon: ${settings.phone} (ring restaurangen)`}
            >
              <PhoneIcon className="size-4 sm:size-5 shrink-0 text-[#c5a059] transition-transform duration-200 group-hover:scale-110" />
              <div className="min-w-0">
                <span className="block text-[0.55rem] sm:text-[0.68rem] font-bold uppercase tracking-[0.12em] sm:tracking-[0.18em] text-[#c5a059]">
                  TELEFON
                </span>
                <span className="mt-0.5 block text-[0.68rem] sm:text-[0.82rem] font-medium leading-tight text-white whitespace-nowrap transition-colors group-hover:text-[#f3ede2]">
                  {settings.phone}
                </span>
              </div>
            </a>

            {/* Card 3: Avhämtning */}
            <Link
              href="/meny"
              style={{ WebkitBackdropFilter: "blur(20px)" }}
              className="group flex flex-col sm:flex-row items-center sm:items-center text-center sm:text-left gap-1.5 sm:gap-3.5 rounded-xl sm:rounded-2xl border border-white/50 bg-white/[0.16] backdrop-blur-xl px-2 py-2.5 sm:p-3.5 shadow-[0_8px_32px_0_rgba(0,0,0,0.22)] transition-all duration-200 hover:border-white/70 hover:bg-white/[0.24] cursor-pointer"
              aria-label={`Avhämtning: ca ${settings.prepMinutes} minuter (öppna menyn och beställ)`}
            >
              <svg
                viewBox="0 0 24 24"
                className="size-4 sm:size-5 shrink-0 text-[#c5a059] transition-transform duration-200 group-hover:scale-110"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                <path d="M3 6h18" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              <div className="min-w-0">
                <span className="block text-[0.55rem] sm:text-[0.68rem] font-bold uppercase tracking-[0.12em] sm:tracking-[0.18em] text-[#c5a059]">
                  AVHÄMTNING
                </span>
                <span className="mt-0.5 block text-[0.68rem] sm:text-[0.82rem] font-medium leading-tight text-white whitespace-nowrap transition-colors group-hover:text-[#f3ede2]">
                  ca {settings.prepMinutes} min
                </span>
              </div>
            </Link>
          </div>

          {/* Action Buttons */}
          <div className="mt-7 flex flex-row items-center gap-2 sm:gap-3.5 max-w-md sm:max-w-none">
            {/* Primary: Ring restaurangen (Solid Gold) */}
            <a
              href={settings.phoneHref}
              className="inline-flex flex-1 sm:flex-initial min-h-11 sm:min-h-12 items-center justify-center rounded-full bg-[#c5a059] hover:bg-[#d4af37] px-3.5 sm:px-8 py-2.5 sm:py-3 text-[0.8rem] sm:text-sm font-semibold text-stone-950 shadow-md transition-all duration-200 hover:shadow-lg active:scale-[0.98] whitespace-nowrap text-center"
            >
              Ring restaurangen
            </a>

            {/* Secondary: Vägbeskrivning ↗ (Translucent White Frosted Glass with crisp white border) */}
            <a
              href={settings.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ WebkitBackdropFilter: "blur(20px)" }}
              className="inline-flex flex-1 sm:flex-initial min-h-11 sm:min-h-12 items-center justify-center rounded-full border border-white/50 bg-white/[0.16] backdrop-blur-xl hover:border-white/70 hover:bg-white/[0.24] px-3.5 sm:px-8 py-2.5 sm:py-3 text-[0.8rem] sm:text-sm font-semibold text-white shadow-md transition-all duration-200 active:scale-[0.98] whitespace-nowrap text-center"
            >
              Vägbeskrivning ↗
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
