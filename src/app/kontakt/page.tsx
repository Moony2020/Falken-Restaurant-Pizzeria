import type { Metadata } from "next";
import Link from "next/link";
import { ClockIcon, MailIcon, PhoneIcon, PinIcon } from "@/components/icons";
import { MapEmbed } from "@/components/map-embed";
import { OpenStatus } from "@/components/open-status";
import { BannerArt } from "@/components/banner-art";
import { PageBanner } from "@/components/page-banner";
import { buttonClass, eyebrow } from "@/components/ui";
import {
  contactHeroImage,
  CURRENT_SEASON,
  dagensLunch,
  hoursDisplay,
  mapsUrl,
  PREP_MINUTES,
  site,
  type Season,
} from "@/data/site";

export const metadata: Metadata = {
  title: "Kontakt",
  description:
    "Kontakta Restaurang & Pizzeria Falken, Skolgatan 4 i Vintrosa. Telefon 019 29 48 98, öppettider och vägbeskrivning.",
  alternates: { canonical: "/kontakt" },
};

const contacts = [
  {
    icon: PinIcon,
    label: "Adress",
    value: `${site.address.street}, ${site.address.zip} ${site.address.city}`,
    href: mapsUrl,
    external: true,
  },
  {
    icon: PhoneIcon,
    label: "Telefon",
    value: site.phone,
    href: site.phoneHref,
    external: false,
  },
  {
    icon: MailIcon,
    label: "E-post",
    value: site.email,
    href: `mailto:${site.email}`,
    external: false,
  },
];

const quick = [
  {
    icon: PinIcon,
    label: "Adress",
    value: `${site.address.street}, ${site.address.zip} ${site.address.city}`,
    href: mapsUrl,
    external: true,
    ariaLabel: `Adress: ${site.address.street}, ${site.address.zip} ${site.address.city} (öppna vägbeskrivning i Google Maps)`,
  },
  {
    icon: PhoneIcon,
    label: "Telefon",
    value: site.phone,
    href: site.phoneHref,
    external: false,
    ariaLabel: `Telefon: ${site.phone} (ring restaurangen)`,
  },
  {
    icon: ClockIcon,
    label: "Avhämtning",
    value: `ca ${PREP_MINUTES} min`,
    href: "/meny",
    external: false,
    ariaLabel: `Avhämtning ca ${PREP_MINUTES} minuter (öppna menyn och beställ)`,
  },
];

const faqs = [
  {
    q: "Kan jag få maten hemkörd?",
    a: "Beställningar online är för avhämtning hos oss på Skolgatan 4. Vi erbjuder ingen hemleverans.",
  },
  {
    q: "Hur lång tid tar det att få sin beställning?",
    a: `Vi räknar normalt med cirka ${PREP_MINUTES} minuter. När det är mycket att göra i köket kan det ta lite längre, så välj gärna en hämtningstid i förväg.`,
  },
  {
    q: "Kan jag ändra på ingredienserna?",
    a: "Ja. När du beställer kan du ta bort ingredienser utan kostnad och skriva önskemål till köket. Vill du ha extra tillbehör, fråga oss så hjälper vi dig.",
  },
  {
    q: "Har ni glutenfri pizza?",
    a: "Vi kan baka pizza på glutenfri deg mot ett tillägg på 30 kr. Har du celiaki eller svår allergi – ring oss innan du beställer så går vi igenom vad som gäller.",
  },
  {
    q: "Vad ingår i dagens lunch?",
    a: "Dagens lunch serveras vardagar 11:00–14:00 och inkluderar kaffe, bröd, smör, pizzasallad och dricka. Se lunchmenyn för vad du kan välja bland.",
  },
];

const seasonTitle: Record<Season, string> = {
  vinter: "Vintertider",
  sommar: "Sommartider",
};

export default function KontaktPage() {
  return (
    <>
      <PageBanner
        eyebrow="Välkommen"
        title="Kontakt"
        text="Ring, mejla eller titta förbi – vi finns i Vintrosa och tar gärna emot dina frågor."
        aside={<BannerArt image={contactHeroImage} />}
      >
        <div className="mt-6">
          <OpenStatus />
        </div>
        <ul className="mt-6 grid max-w-xl gap-3 sm:grid-cols-3 lg:max-w-2xl">
          {quick.map(({ icon: Icon, label, value, href, external, ariaLabel }) => (
            <li key={label}>
              <a
                href={href}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                aria-label={ariaLabel}
                className="group flex h-full items-center gap-3 rounded-2xl border border-ivory/15 bg-ivory/5 p-3.5 backdrop-blur transition duration-200 hover:border-gold hover:bg-ivory/10 hover:shadow-md cursor-pointer"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold/15 text-gold transition duration-200 group-hover:bg-gold group-hover:text-ink">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block text-[0.65rem] uppercase tracking-[0.18em] text-ivory/60">
                    {label}
                  </span>
                  <span className="block text-xs font-semibold sm:text-[0.82rem] leading-snug text-ivory group-hover:text-gold transition">
                    {value}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={site.phoneHref} className={buttonClass("gold")}>
            Ring restaurangen
          </a>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass("outline-light")}
          >
            Vägbeskrivning
          </a>
        </div>
      </PageBanner>

      <div className="wrap grid gap-10 py-14 sm:py-20 lg:grid-cols-[1fr_1.1fr]">
        <section aria-labelledby="contact-title">
          <p className={eyebrow}>Hitta oss</p>
          <h2
            id="contact-title"
            className="mt-1 text-4xl font-medium uppercase sm:text-5xl"
          >
            {site.legalName}
          </h2>
          <ul className="mt-8 space-y-3">
            {contacts.map(({ icon: Icon, label, value, href, external }) => (
              <li key={label}>
                <a
                  href={href}
                  {...(external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  className="group flex items-center gap-4 rounded-2xl border border-line bg-white p-4 shadow-card transition hover:border-gold"
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-cream text-gold-deep transition group-hover:bg-gold group-hover:text-ink">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs uppercase tracking-[0.18em] text-muted">
                      {label}
                    </span>
                    <span className="block break-words font-medium">
                      {value}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass("ink")}
            >
              Vägbeskrivning
            </a>
            <Link href="/meny" className={buttonClass("gold")}>
              Beställ online
            </Link>
          </div>
        </section>

        <section
          id="oppettider"
          aria-labelledby="hours-title"
          className="scroll-mt-32 rounded-2xl bg-ink p-7 text-ivory sm:p-10"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2
              id="hours-title"
              className="flex items-center gap-3 text-3xl font-medium uppercase"
            >
              <ClockIcon className="size-7 text-gold" /> Öppettider
            </h2>
            <OpenStatus />
          </div>
          <div className="mt-6 space-y-8">
            {(Object.keys(hoursDisplay) as Season[])
              .sort((a) => (a === CURRENT_SEASON ? -1 : 1))
              .map((season) => (
                <div key={season}>
                  <h3 className="text-xl font-semibold text-gold">
                    {seasonTitle[season]}
                    {season === CURRENT_SEASON && (
                      <span className="ml-3 rounded-full bg-gold/15 px-3 py-0.5 align-middle font-sans text-[0.68rem] font-semibold uppercase tracking-[0.14em]">
                        Gäller nu
                      </span>
                    )}
                  </h3>
                  <dl className="mt-2 divide-y divide-ink-3">
                    {hoursDisplay[season].map((row) => (
                      <div
                        key={row.days}
                        className="flex justify-between gap-4 py-2.5 text-[0.95rem]"
                      >
                        <dt>{row.days}</dt>
                        <dd className="tabular-nums text-muted-dark">
                          {row.time}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
          </div>
          <p className="mt-6 text-xs leading-relaxed text-muted-dark">
            Helgdagar och särskilda stängningar meddelas här och via telefon.
          </p>
        </section>
      </div>

      <section aria-labelledby="lunch-title" className="wrap pb-14 sm:pb-20">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex gap-4 rounded-2xl border border-line bg-white p-6 shadow-card">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-cream text-gold-deep">
              <ClockIcon className="size-5" />
            </span>
            <div>
              <h2
                id="lunch-title"
                className="font-display text-2xl font-semibold"
              >
                Dagens lunch · {dagensLunch.price} kr
              </h2>
              <p className="mt-1 text-sm text-muted">
                {dagensLunch.days} {dagensLunch.time}. {dagensLunch.includes}
              </p>
              <Link
                href="/meny#lunch"
                className="mt-3 inline-block text-sm font-semibold text-gold-deep underline underline-offset-4"
              >
                Se vad du kan välja
              </Link>
            </div>
          </div>
          <div className="flex gap-4 rounded-2xl border border-line bg-white p-6 shadow-card">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-cream text-gold-deep">
              <PhoneIcon className="size-5" />
            </span>
            <div>
              <h2 className="font-display text-2xl font-semibold">
                Avhämtning
              </h2>
              <p className="mt-1 text-sm text-muted">
                Klart efter ca {PREP_MINUTES} minuter. Beställ online och välj
                hämtningstid, eller ring oss på {site.phone}.
              </p>
              <Link
                href="/meny"
                className="mt-3 inline-block text-sm font-semibold text-gold-deep underline underline-offset-4"
              >
                Beställ online
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="faq-title" className="bg-cream py-16 sm:py-20">
        <div className="wrap max-w-3xl">
          <p className={eyebrow}>Vanliga frågor</p>
          <h2
            id="faq-title"
            className="mt-1 text-4xl font-medium uppercase sm:text-5xl"
          >
            Bra att veta
          </h2>
          <div className="mt-8 divide-y divide-line rounded-2xl border border-line bg-white">
            {faqs.map((f) => (
              <details key={f.q} className="group px-6 py-1">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span
                    aria-hidden="true"
                    className="relative block size-4 shrink-0 text-gold-deep"
                  >
                    <span className="absolute left-0 top-1/2 block h-0.5 w-full -translate-y-1/2 rounded bg-current" />
                    <span className="absolute left-1/2 top-0 block h-full w-0.5 -translate-x-1/2 rounded bg-current transition-opacity group-open:opacity-0" />
                  </span>
                </summary>
                <p className="pb-5 text-sm leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="map-title" className="py-14 sm:py-20">
        <div className="wrap">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className={eyebrow}>Karta &amp; besök</p>
              <h2
                id="map-title"
                className="mt-1 text-4xl font-medium uppercase sm:text-5xl"
              >
                Hitta till Falken
              </h2>
            </div>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass("ink")}
            >
              Få vägbeskrivning
            </a>
          </div>
          <MapEmbed />
          <p className="mt-4 text-sm text-muted">
            {site.address.street}, {site.address.zip} {site.address.city}
          </p>
        </div>
      </section>
    </>
  );
}
