"use client";

import Link from "next/link";
import { CURRENT_SEASON, hoursDisplay, nav } from "@/data/site";
import { useRestaurantSettings } from "@/lib/use-restaurant-settings";
import { FacebookIcon, InstagramIcon, MailIcon, PhoneIcon, PinIcon } from "./icons";
import { Logo } from "./logo";

export function Footer() {
  const { settings } = useRestaurantSettings();

  return (
    <footer className="bg-ink text-ivory">
      <div className="wrap grid gap-10 py-14 min-[520px]:grid-cols-2 min-[520px]:gap-x-12 min-[520px]:gap-y-10 lg:grid-cols-[1.4fr_1fr_1.2fr_1.2fr] lg:gap-12 lg:py-16">
        <div className="space-y-5">
          <Logo />
          <p className="max-w-xs text-sm leading-relaxed text-muted-dark">
            Pizza, kebab och à la carte i Vintrosa. Beställ för avhämtning eller slå dig ner hos oss.
          </p>
          <div className="flex items-center gap-3 pt-2">
            <a
              href={settings.social.facebook}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Följ ${settings.name} på Facebook`}
              className="group flex size-10 items-center justify-center rounded-full border border-gold/40 bg-white/5 text-gold transition-all duration-300 hover:border-gold hover:bg-gold hover:text-ink hover:scale-105 shadow-sm"
              title={`Följ ${settings.name} på Facebook`}
            >
              <FacebookIcon className="size-5 transition-transform group-hover:scale-110" />
            </a>
            <a
              href={settings.social.instagram}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Följ ${settings.name} på Instagram`}
              className="group flex size-10 items-center justify-center rounded-full border border-gold/40 bg-white/5 text-gold transition-all duration-300 hover:border-gold hover:bg-gold hover:text-ink hover:scale-105 shadow-sm"
              title={`Följ ${settings.name} på Instagram`}
            >
              <InstagramIcon className="size-5 transition-transform group-hover:scale-110" />
            </a>
          </div>
        </div>

        <nav aria-label="Sidor">
          <h2 className="font-display text-xl text-gold">Utforska</h2>
          <ul className="mt-4 space-y-1">
            {nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="inline-flex min-h-9 items-center text-sm text-ivory/85 hover:text-gold">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="font-display text-xl text-gold">Hitta hit</h2>
          <address className="mt-4 space-y-3 text-sm not-italic text-ivory/85">
            <a href={settings.mapsUrl} target="_blank" rel="noopener noreferrer" className="flex gap-3 hover:text-gold">
              <PinIcon className="mt-0.5 size-5 shrink-0 text-gold" />
              <span>
                {settings.address.street}
                <br />
                {settings.address.zip} {settings.address.city}
              </span>
            </a>
            <a href={settings.phoneHref} className="flex items-center gap-3 hover:text-gold">
              <PhoneIcon className="size-5 shrink-0 text-gold" />
              {settings.phone}
            </a>
            <a href={`mailto:${settings.email}`} className="flex items-center gap-3 break-all hover:text-gold">
              <MailIcon className="size-5 shrink-0 text-gold" />
              {settings.email}
            </a>
          </address>
        </div>

        <div className="max-w-xs sm:max-w-sm">
          <h2 className="font-display text-xl text-gold">Öppettider</h2>
          <dl className="mt-4 space-y-2 text-sm">
            {hoursDisplay[CURRENT_SEASON].map((row) => (
              <div key={row.days} className="flex items-baseline justify-between gap-3">
                <dt className="text-ivory/85 shrink-0">{row.days}</dt>
                <span className="flex-1 border-b border-dotted border-white/15 mb-1" aria-hidden="true" />
                <dd className="tabular-nums font-mono text-muted-dark shrink-0">{row.time}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted-dark">
            <Link href="/kontakt#oppettider" className="underline underline-offset-2 hover:text-gold">
              Se sommartider
            </Link>
          </p>
        </div>
      </div>

      <div className="border-t border-ink-3">
        <div className="wrap py-6 text-center text-xs text-muted-dark">
          <p>© {settings.legalName}. Alla rättigheter förbehållna.</p>
        </div>
      </div>
    </footer>
  );
}
