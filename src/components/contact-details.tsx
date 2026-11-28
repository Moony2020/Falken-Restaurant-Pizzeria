"use client";

import Link from "next/link";
import { ClockIcon, MailIcon, PinIcon } from "@/components/icons";
import { eyebrow } from "@/components/ui";
import { dagensLunch } from "@/data/site";
import { useRestaurantSettings } from "@/lib/use-restaurant-settings";

export function ContactInfoCards() {
  const { settings } = useRestaurantSettings();

  return (
    <section aria-labelledby="contact-service-title" className="flex flex-col justify-between">
      <div>
        <p className={eyebrow}>Service &amp; besök</p>
        <h2
          id="contact-service-title"
          className="mt-1 font-display text-3xl sm:text-4xl lg:text-5xl font-normal uppercase tracking-tight text-[#14161a]"
        >
          Ditt besök hos oss
        </h2>
        <p className="mt-2.5 text-[0.95rem] sm:text-base leading-relaxed text-[#5f636b]">
          Välkommen till en trevlig stund i vår matsal eller beställ mat för snabb avhämtning. Här hittar du praktisk information inför ditt besök.
        </p>

        <div className="mt-7 space-y-4">
          {/* Card 1: Dagens lunch */}
          <div className="group rounded-2xl border border-[#e8e2d5] bg-white p-5 sm:p-6 shadow-[0_4px_20px_-8px_rgba(20,22,26,0.06)] transition-all duration-200 hover:border-[#c5a059] hover:shadow-[0_8px_24px_-8px_rgba(20,22,26,0.12)]">
            <div className="flex items-start gap-4">
              <span className="grid size-11 sm:size-12 shrink-0 place-items-center rounded-xl bg-[#faf6ee] text-[#8a6d2b] border border-[#eaddc4] transition-colors duration-200 group-hover:bg-[#c5a059] group-hover:text-stone-950 group-hover:border-[#c5a059]">
                <ClockIcon className="size-5 sm:size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-display text-xl sm:text-2xl font-semibold text-[#14161a]">
                    Dagens lunch · {dagensLunch.price} kr
                  </h3>
                  <span className="rounded-full bg-[#f2eee4] px-2.5 py-0.5 text-xs font-semibold text-[#8a6d2b]">
                    {dagensLunch.days} {dagensLunch.time}
                  </span>
                </div>
                <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-[#5f636b]">
                  {dagensLunch.includes}
                </p>
                <Link
                  href="/meny#lunch"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#8a6d2b] hover:text-[#14161a] transition-colors"
                >
                  Se lunchmenyn <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Card 2: Bordsbokning & större sällskap */}
          <div className="group rounded-2xl border border-[#e8e2d5] bg-white p-5 sm:p-6 shadow-[0_4px_20px_-8px_rgba(20,22,26,0.06)] transition-all duration-200 hover:border-[#c5a059] hover:shadow-[0_8px_24px_-8px_rgba(20,22,26,0.12)]">
            <div className="flex items-start gap-4">
              <span className="grid size-11 sm:size-12 shrink-0 place-items-center rounded-xl bg-[#faf6ee] text-[#8a6d2b] border border-[#eaddc4] transition-colors duration-200 group-hover:bg-[#c5a059] group-hover:text-stone-950 group-hover:border-[#c5a059]">
                <PinIcon className="size-5 sm:size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-xl sm:text-2xl font-semibold text-[#14161a]">
                  Bordsbokning &amp; sällskap
                </h3>
                <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-[#5f636b]">
                  Vi har en rymlig och trivsam matsal med gott om plats. Drop-in är alltid välkommet! Vid sällskap över 8 personer, ring oss gärna så förbereder vi bordet åt er.
                </p>
                <a
                  href={settings.phoneHref}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#8a6d2b] hover:text-[#14161a] transition-colors"
                >
                  Ring för bokning: {settings.phone} <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>
          </div>

          {/* Card 3: E-post & Catering */}
          <div className="group rounded-2xl border border-[#e8e2d5] bg-white p-5 sm:p-6 shadow-[0_4px_20px_-8px_rgba(20,22,26,0.06)] transition-all duration-200 hover:border-[#c5a059] hover:shadow-[0_8px_24px_-8px_rgba(20,22,26,0.12)]">
            <div className="flex items-start gap-4">
              <span className="grid size-11 sm:size-12 shrink-0 place-items-center rounded-xl bg-[#faf6ee] text-[#8a6d2b] border border-[#eaddc4] transition-colors duration-200 group-hover:bg-[#c5a059] group-hover:text-stone-950 group-hover:border-[#c5a059]">
                <MailIcon className="size-5 sm:size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-xl sm:text-2xl font-semibold text-[#14161a]">
                  Catering &amp; förfrågningar
                </h3>
                <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-[#5f636b]">
                  Planerar du fest eller företagslunch? Hör av dig med dina önskemål så skräddarsyr vi en passande meny.
                </p>
                <a
                  href={`mailto:${settings.email}`}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#8a6d2b] hover:text-[#14161a] transition-colors break-all"
                >
                  {settings.email} <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-2">
        <Link
          href="/meny"
          className="inline-flex min-h-12 w-full sm:w-auto items-center justify-center rounded-full bg-[#c5a059] hover:bg-[#d4af37] px-8 py-3.5 text-sm font-semibold text-stone-950 shadow-md transition-all duration-200 hover:shadow-lg active:scale-[0.98] text-center"
        >
          Utforska hela menyn &amp; beställ online
        </Link>
      </div>
    </section>
  );
}

export function ContactPickupCard() {
  return null;
}

export function ContactMapHeader() {
  const { settings } = useRestaurantSettings();

  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className={eyebrow}>Karta &amp; besök</p>
        <h2
          id="map-title"
          className="mt-1 font-display text-3xl sm:text-4xl lg:text-5xl font-normal uppercase tracking-tight text-[#14161a]"
        >
          Hitta till {settings.name}
        </h2>
        <p className="mt-2 text-sm sm:text-base text-[#5f636b]">
          {settings.address.street}, {settings.address.zip} {settings.address.city} · Gratis gästparkering finns direkt intill entrén.
        </p>
      </div>
      <a
        href={settings.mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#14161a] bg-[#14161a] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#272b32] active:scale-[0.98]"
      >
        Öppna i Google Maps ↗
      </a>
    </div>
  );
}

export function ContactMapAddress() {
  return null;
}
