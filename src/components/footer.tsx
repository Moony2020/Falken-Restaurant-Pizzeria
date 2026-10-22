import Link from "next/link";
import { CURRENT_SEASON, hoursDisplay, mapsUrl, nav, site } from "@/data/site";
import { MailIcon, PhoneIcon, PinIcon } from "./icons";
import { Logo } from "./logo";

export function Footer() {
  return (
    <footer className="bg-ink text-ivory">
      <div className="wrap grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.2fr_1.2fr]">
        <div className="space-y-5">
          <Logo />
          <p className="max-w-xs text-sm leading-relaxed text-muted-dark">
            Pizza, kebab och à la carte i Vintrosa. Beställ för avhämtning eller slå dig ner hos oss.
          </p>
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
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="flex gap-3 hover:text-gold">
              <PinIcon className="mt-0.5 size-5 shrink-0 text-gold" />
              <span>
                {site.address.street}
                <br />
                {site.address.zip} {site.address.city}
              </span>
            </a>
            <a href={site.phoneHref} className="flex items-center gap-3 hover:text-gold">
              <PhoneIcon className="size-5 shrink-0 text-gold" />
              {site.phone}
            </a>
            <a href={`mailto:${site.email}`} className="flex items-center gap-3 break-all hover:text-gold">
              <MailIcon className="size-5 shrink-0 text-gold" />
              {site.email}
            </a>
          </address>
        </div>

        <div>
          <h2 className="font-display text-xl text-gold">Öppettider</h2>
          <dl className="mt-4 space-y-2 text-sm">
            {hoursDisplay[CURRENT_SEASON].map((row) => (
              <div key={row.days} className="flex justify-between gap-4">
                <dt className="text-ivory/85">{row.days}</dt>
                <dd className="tabular-nums text-muted-dark">{row.time}</dd>
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
        <div className="wrap flex flex-col gap-2 py-6 text-xs text-muted-dark sm:flex-row sm:justify-between">
          <p>© {site.legalName}. Alla rättigheter förbehållna.</p>
          <p>Avhämtning · Skolgatan 4, Vintrosa</p>
        </div>
      </div>
    </footer>
  );
}
