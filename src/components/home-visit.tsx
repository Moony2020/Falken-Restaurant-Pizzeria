"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ArrowIcon,
  ClockIcon,
  FalconEmblem,
  MailIcon,
  PhoneIcon,
  PinIcon,
} from "@/components/icons";
import { useRestaurantStatus } from "@/lib/use-restaurant-status";
import { CURRENT_SEASON, hoursDisplay, mapsUrl, site } from "@/data/site";

const emptySubscribe = () => () => {};
const getClientDay = () => new Date().getDay();
const getServerDay = () => null;

function isDayMatchingRow(daysString: string, dayOfWeek: number): boolean {
  if (daysString.includes("Måndag–Torsdag")) {
    return dayOfWeek >= 1 && dayOfWeek <= 4;
  }
  if (daysString.includes("Måndag–Fredag")) {
    return dayOfWeek >= 1 && dayOfWeek <= 5;
  }
  if (daysString === "Fredag") {
    return dayOfWeek === 5;
  }
  if (daysString === "Lördag") {
    return dayOfWeek === 6;
  }
  if (daysString === "Söndag") {
    return dayOfWeek === 0;
  }
  if (daysString.includes("Lördag–Söndag")) {
    return dayOfWeek === 6 || dayOfWeek === 0;
  }
  return false;
}

export function HomeVisit() {
  const { status } = useRestaurantStatus();
  const currentDay = useSyncExternalStore(emptySubscribe, getClientDay, getServerDay);

  return (
    <div aria-labelledby="visit-title" className="grid gap-6 lg:grid-cols-12 items-stretch">
      
      {/* Card 1: Hitta hit (Location, Contact & Direct Actions) */}
      <div className="lg:col-span-6 relative overflow-hidden rounded-2xl sm:rounded-3xl border border-[#ede6da] bg-white px-3 py-5 sm:p-8 lg:p-9 shadow-sm transition-all duration-300 hover:shadow-md flex flex-col justify-between">
        
        {/* Subtle Watermark Falcon Emblem */}
        <div className="pointer-events-none absolute -right-6 -bottom-6 select-none text-gold/[0.07]" aria-hidden="true">
          <FalconEmblem className="size-48 sm:size-56" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold-deep">
              Välkommen in
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/10 px-3 py-1 text-[0.7rem] font-semibold text-gold-deep border border-gold/20">
              <PinIcon className="size-3.5" /> Vintrosa centrum
            </span>
          </div>

          <h3 id="visit-title" className="mt-2 font-display text-2xl sm:text-3xl lg:text-[2.1rem] font-normal uppercase tracking-wide text-ink">
            Hitta till Falken
          </h3>
          <p className="mt-2 text-xs sm:text-sm text-muted leading-relaxed max-w-md">
            Slå dig ner i vår ombonade restaurang på Skolgatan 4 eller sväng förbi för att hämta din nylagade beställning.
          </p>

          {/* Interactive Info Rows with Gold Badge Icons */}
          <div className="mt-6 sm:mt-7 space-y-3.5">
            
            {/* Address */}
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3.5 p-3 rounded-xl border border-transparent transition-all duration-200 hover:border-gold/30 hover:bg-[#fbf9f5]"
            >
              <div className="size-10 rounded-full border border-gold/40 bg-gold/10 flex items-center justify-center text-gold-deep shrink-0 transition-transform group-hover:scale-105">
                <PinIcon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink group-hover:text-gold-deep transition-colors">
                    {site.legalName}
                  </p>
                  <ArrowIcon className="size-3.5 text-muted opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
                </div>
                <p className="text-xs text-muted mt-0.5">
                  {site.address.street}, {site.address.zip} {site.address.city}
                </p>
                <span className="inline-block text-[0.68rem] text-emerald-700 font-medium mt-1">
                  • Gratis parkering direkt vid entrén
                </span>
              </div>
            </a>

            {/* Phone */}
            <a
              href={site.phoneHref}
              className="group flex items-start gap-3.5 p-3 rounded-xl border border-transparent transition-all duration-200 hover:border-gold/30 hover:bg-[#fbf9f5]"
            >
              <div className="size-10 rounded-full border border-gold/40 bg-gold/10 flex items-center justify-center text-gold-deep shrink-0 transition-transform group-hover:scale-105">
                <PhoneIcon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink group-hover:text-gold-deep transition-colors">
                    {site.phone}
                  </p>
                  <span className="text-[0.7rem] font-medium text-gold-deep uppercase tracking-wider">Ring nu</span>
                </div>
                <p className="text-xs text-muted mt-0.5">
                  Ring för beställning, bordsbokning eller större sällskap
                </p>
              </div>
            </a>

            {/* Email */}
            <a
              href={`mailto:${site.email}`}
              className="group flex items-start gap-3.5 p-3 rounded-xl border border-transparent transition-all duration-200 hover:border-gold/30 hover:bg-[#fbf9f5]"
            >
              <div className="size-10 rounded-full border border-gold/40 bg-gold/10 flex items-center justify-center text-gold-deep shrink-0 transition-transform group-hover:scale-105">
                <MailIcon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink break-all group-hover:text-gold-deep transition-colors">
                  {site.email}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  Frågor gällande catering, fakturor eller evenemang
                </p>
              </div>
            </a>

          </div>
        </div>

        {/* Action Buttons: Side-by-side on all screens with compact sizing */}
        <div className="relative z-10 mt-6 pt-4 border-t border-[#ede6da] flex items-center gap-2 sm:gap-3">
          <a
            href={site.phoneHref}
            className="inline-flex flex-1 items-center justify-center gap-1.5 sm:gap-2 rounded-full bg-gradient-to-r from-gold via-[#d4af37] to-gold-deep text-ink font-semibold text-xs sm:text-sm px-2 sm:px-4 py-2.5 sm:py-3 min-h-10 sm:min-h-11 shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-105 active:scale-[0.98] whitespace-nowrap"
          >
            <PhoneIcon className="size-3.5 sm:size-4 shrink-0" /> Ring och beställ
          </a>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 items-center justify-center gap-1.5 sm:gap-2 rounded-full border border-[#ede6da] bg-white px-2 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold text-ink min-h-10 sm:min-h-11 transition-all duration-200 hover:border-gold hover:bg-[#fbf9f5] active:scale-[0.98] whitespace-nowrap"
          >
            <PinIcon className="size-3.5 sm:size-4 text-gold-deep shrink-0" /> Vägbeskrivning
          </a>
        </div>

      </div>

      {/* Card 2: Öppettider (Live Status & Highlighting Today) */}
      <div className="lg:col-span-6 relative overflow-hidden rounded-2xl sm:rounded-3xl border border-[#ede6da] bg-white px-3 py-5 sm:p-8 lg:p-9 shadow-sm transition-all duration-300 hover:shadow-md flex flex-col justify-between">
        
        {/* Subtle Watermark Falcon Emblem */}
        <div className="pointer-events-none absolute -right-6 -bottom-6 select-none text-gold/[0.07]" aria-hidden="true">
          <FalconEmblem className="size-48 sm:size-56" />
        </div>

        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold-deep">
              Öppettider
            </p>

            {/* Live Status Pill with Pulse */}
            {status && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shadow-xs ${
                  status.isOpen
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-amber-50 text-amber-900 border border-amber-200"
                }`}
              >
                <span
                  className={`size-2 rounded-full ${
                    status.isOpen ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                  }`}
                  aria-hidden="true"
                />
                {status.label}
              </span>
            )}
          </div>

          <h3 className="mt-2 font-display text-2xl sm:text-3xl lg:text-[2.1rem] font-normal uppercase tracking-wide text-ink">
            Vi har öppet
          </h3>
          <p className="mt-2 text-xs sm:text-sm text-muted leading-relaxed">
            Välkommen under våra ordinarie öppettider. Dagens lunch serveras vardagar 11:00–14:00.
          </p>

          {/* Opening Hours List with Dynamic "Idag" Indicator */}
          <div className="mt-6 space-y-2">
            {hoursDisplay[CURRENT_SEASON].map((row) => {
              const isToday = currentDay !== null && isDayMatchingRow(row.days, currentDay);

              return (
                <div
                  key={row.days}
                  className={`flex items-center justify-between py-2 sm:py-2.5 px-2 sm:px-3.5 rounded-xl transition-all duration-200 ${
                    isToday
                      ? "bg-gold/15 border border-gold/40 shadow-xs"
                      : "border border-transparent hover:bg-[#fbf9f5]"
                  }`}
                >
                  <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                    <span className={`text-xs sm:text-sm whitespace-nowrap ${isToday ? "font-bold text-ink" : "font-medium text-ink/85"}`}>
                      {row.days}
                    </span>
                    {isToday && (
                      <span className="rounded-full bg-gold px-1.5 sm:px-2 py-0.5 text-[0.6rem] sm:text-[0.62rem] font-bold uppercase tracking-wider text-ink shadow-xs shrink-0">
                        Idag
                      </span>
                    )}
                  </div>

                  <span className={`tabular-nums text-xs sm:text-sm shrink-0 whitespace-nowrap ${isToday ? "font-bold text-ink" : "font-medium text-muted"}`}>
                    {row.time}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Kitchen notice */}
          <div className="mt-5 p-3 rounded-xl bg-[#fbf9f5] border border-[#ede6da] flex items-center gap-2.5 text-xs text-muted">
            <ClockIcon className="size-4 text-gold-deep shrink-0" />
            <span>Köket stänger 15 minuter innan stängningstid för avhämtning.</span>
          </div>
        </div>

        {/* Bottom Season & Quick Links */}
        <div className="relative z-10 mt-7 pt-5 border-t border-[#ede6da] flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
          <Link
            href="/kontakt#oppettider"
            className="font-semibold text-gold-deep hover:underline inline-flex items-center gap-1.5"
          >
            <span>Sommartider & helgdagar</span>
            <ArrowIcon className="size-3.5" />
          </Link>
          
          <Link
            href="/meny"
            className="font-semibold text-ink hover:text-gold-deep inline-flex items-center gap-1.5"
          >
            <span>Se hela menyn</span>
            <ArrowIcon className="size-3.5" />
          </Link>
        </div>

      </div>

    </div>
  );
}
