import type { Metadata } from "next";
import Link from "next/link";
import { ClockIcon } from "@/components/icons";
import { MapEmbed } from "@/components/map-embed";
import { OpenStatus } from "@/components/open-status";
import { ContactHero } from "@/components/contact-hero";
import {
  ContactInfoCards,
  ContactPickupCard,
  ContactMapHeader,
  ContactMapAddress,
} from "@/components/contact-details";
import { eyebrow } from "@/components/ui";
import {
  CURRENT_SEASON,
  dagensLunch,
  hoursDisplay,
  PREP_MINUTES,
  type Season,
} from "@/data/site";

export const metadata: Metadata = {
  title: "Kontakt",
  description:
    "Kontakta Restaurang & Pizzeria Falken, Skolgatan 4 i Vintrosa. Telefon 019 29 48 98, öppettider och vägbeskrivning.",
  alternates: { canonical: "/kontakt" },
};

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
      <ContactHero />

      <div className="wrap grid gap-10 py-14 sm:py-20 lg:grid-cols-[1fr_1.1fr]">
        <ContactInfoCards />

        <section
          id="oppettider"
          aria-labelledby="hours-title"
          data-reveal="fade-up"
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
          <ContactPickupCard />
        </div>
      </section>

      <section aria-labelledby="faq-title" className="bg-cream py-16 sm:py-20" data-reveal="fade-up">
        <div className="wrap">
          <p className={eyebrow}>Vanliga frågor</p>
          <h2
            id="faq-title"
            className="mt-1 text-2xl font-medium uppercase min-[440px]:text-3xl sm:text-5xl"
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
          <ContactMapHeader />
          <MapEmbed />
          <ContactMapAddress />
        </div>
      </section>
    </>
  );
}
