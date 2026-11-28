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
          className="pointer-events-none absolute left-0 top-0 h-[72%] w-full max-w-4xl bg-gradient-to-r from-black/85 via-black/50 to-transparent [mask-image:linear-gradient(to_bottom,black_75%,transparent_100%)]"
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
          <p className="mt-2.5 max-w-none text-[1.02rem] leading-relaxed text-stone-100 sm:mt-3 sm:text-[1.12rem] lg:text-[1.18rem] md:whitespace-nowrap drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">
            Ring, mejla eller titta förbi – vi finns i Vintrosa och tar gärna emot dina frågor.
          </p>

          {/* Live Open Status */}
          <div className="mt-3 flex items-center">
            <OpenStatus tone="dark" />
          </div>

          {/* 3 Quick Contact Info Cards - In 1 row across all screen sizes (spacious & highly legible) */}
          <div className="mt-6 sm:mt-7 grid grid-cols-3 gap-2.5 sm:gap-3.5 md:gap-4 max-w-xl sm:max-w-2xl lg:max-w-3xl">
            {/* Card 1: Adress */}
            <a
              href={settings.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ WebkitBackdropFilter: "blur(20px)" }}
              className="group flex flex-col sm:flex-row items-center sm:items-center text-center sm:text-left gap-2 sm:gap-3.5 md:gap-4 rounded-xl sm:rounded-2xl border border-white/50 bg-white/[0.16] backdrop-blur-xl p-2.5 sm:p-4 lg:p-4.5 shadow-[0_8px_32px_0_rgba(0,0,0,0.22)] transition-all duration-200 hover:border-white/70 hover:bg-white/[0.24] cursor-pointer"
              aria-label={`Adress: ${settings.address.street}, ${settings.address.zip} ${settings.address.city} (öppna vägbeskrivning)`}
            >
              <PinIcon className="size-5 sm:size-5.5 lg:size-6 shrink-0 text-[#c5a059] transition-transform duration-200 group-hover:scale-110" />
              <div className="min-w-0">
                <span className="block text-[0.62rem] sm:text-[0.74rem] lg:text-[0.78rem] font-bold uppercase tracking-[0.14em] sm:tracking-[0.18em] text-[#c5a059]">
                  ADRESS
                </span>
                <span className="mt-0.5 block text-[0.74rem] sm:text-[0.88rem] lg:text-[0.94rem] font-medium leading-snug text-white transition-colors group-hover:text-[#f3ede2]">
                  <span className="block">{settings.address.street},</span>
                  <span className="block text-[0.7rem] sm:text-[0.82rem] lg:text-[0.88rem] text-stone-200 whitespace-nowrap">{settings.address.zip} {settings.address.city}</span>
                </span>
              </div>
            </a>

            {/* Card 2: Telefon */}
            <a
              href={settings.phoneHref}
              style={{ WebkitBackdropFilter: "blur(20px)" }}
              className="group flex flex-col sm:flex-row items-center sm:items-center text-center sm:text-left gap-2 sm:gap-3.5 md:gap-4 rounded-xl sm:rounded-2xl border border-white/50 bg-white/[0.16] backdrop-blur-xl p-2.5 sm:p-4 lg:p-4.5 shadow-[0_8px_32px_0_rgba(0,0,0,0.22)] transition-all duration-200 hover:border-white/70 hover:bg-white/[0.24] cursor-pointer"
              aria-label={`Telefon: ${settings.phone} (ring restaurangen)`}
            >
              <PhoneIcon className="size-5 sm:size-5.5 lg:size-6 shrink-0 text-[#c5a059] transition-transform duration-200 group-hover:scale-110" />
              <div className="min-w-0">
                <span className="block text-[0.62rem] sm:text-[0.74rem] lg:text-[0.78rem] font-bold uppercase tracking-[0.14em] sm:tracking-[0.18em] text-[#c5a059]">
                  TELEFON
                </span>
                <span className="mt-0.5 block text-[0.74rem] sm:text-[0.88rem] lg:text-[0.94rem] font-medium leading-snug text-white whitespace-nowrap transition-colors group-hover:text-[#f3ede2]">
                  {settings.phone}
                </span>
              </div>
            </a>

            {/* Card 3: Avhämtning */}
            <Link
              href="/meny"
              style={{ WebkitBackdropFilter: "blur(20px)" }}
              className="group flex flex-col sm:flex-row items-center sm:items-center text-center sm:text-left gap-2 sm:gap-3.5 md:gap-4 rounded-xl sm:rounded-2xl border border-white/50 bg-white/[0.16] backdrop-blur-xl p-2.5 sm:p-4 lg:p-4.5 shadow-[0_8px_32px_0_rgba(0,0,0,0.22)] transition-all duration-200 hover:border-white/70 hover:bg-white/[0.24] cursor-pointer"
              aria-label={`Avhämtning: ca ${settings.prepMinutes} minuter (öppna menyn och beställ)`}
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5 sm:size-5.5 lg:size-6 shrink-0 text-[#c5a059] transition-transform duration-200 group-hover:scale-110"
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
                <span className="block text-[0.62rem] sm:text-[0.74rem] lg:text-[0.78rem] font-bold uppercase tracking-[0.14em] sm:tracking-[0.18em] text-[#c5a059]">
                  AVHÄMTNING
                </span>
                <span className="mt-0.5 block text-[0.74rem] sm:text-[0.88rem] lg:text-[0.94rem] font-medium leading-snug text-white whitespace-nowrap transition-colors group-hover:text-[#f3ede2]">
                  ca {settings.prepMinutes} min
                </span>
              </div>
            </Link>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 sm:mt-8 flex flex-row items-center gap-2 sm:gap-4 max-w-sm sm:max-w-none">
            {/* Primary: Ring restaurangen (Solid Gold) */}
            <a
              href={settings.phoneHref}
              className="inline-flex flex-1 sm:flex-initial min-h-10 sm:min-h-[50px] items-center justify-center rounded-full bg-[#c5a059] hover:bg-[#d4af37] px-3 sm:px-9 py-2 sm:py-3.5 text-[0.76rem] min-[380px]:text-[0.82rem] sm:text-[0.95rem] font-semibold text-stone-950 shadow-md transition-all duration-200 hover:shadow-lg active:scale-[0.98] whitespace-nowrap text-center"
            >
              Ring restaurangen
            </a>

            {/* Secondary: Vägbeskrivning ↗ (Translucent White Frosted Glass with crisp white border) */}
            <a
              href={settings.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ WebkitBackdropFilter: "blur(20px)" }}
              className="inline-flex flex-1 sm:flex-initial min-h-10 sm:min-h-[50px] items-center justify-center rounded-full border border-white/50 bg-white/[0.16] backdrop-blur-xl hover:border-white/70 hover:bg-white/[0.24] px-3 sm:px-9 py-2 sm:py-3.5 text-[0.76rem] min-[380px]:text-[0.82rem] sm:text-[0.95rem] font-semibold text-white shadow-md transition-all duration-200 active:scale-[0.98] whitespace-nowrap text-center"
            >
              Vägbeskrivning ↗
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
