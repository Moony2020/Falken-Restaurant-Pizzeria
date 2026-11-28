import type { Metadata } from "next";
import { ClockIcon } from "@/components/icons";
import { MapEmbed } from "@/components/map-embed";
import { OpenStatus } from "@/components/open-status";
import { ContactHero } from "@/components/contact-hero";
import {
  ContactInfoCards,
  ContactMapHeader,
} from "@/components/contact-details";
import { eyebrow } from "@/components/ui";
import {
  CURRENT_SEASON,
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
    a: "Dagens lunch serveras vardagar 11:00–14:00 och inkluderar kaffe, bröd, smör, pizzasallad och måltidsdryck. Se lunchmenyn för vad du kan välja bland.",
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

      {/* Main Content Grid: Dining & Service on left, Luxury Opening Hours on right */}
      <div className="wrap grid gap-10 py-14 sm:py-20 lg:grid-cols-[1.1fr_1fr] items-start">
        <ContactInfoCards />

        <section
          id="oppettider"
          aria-labelledby="hours-title"
          data-reveal="fade-up"
          className="scroll-mt-32 rounded-3xl border border-white/10 bg-gradient-to-b from-[#1b1e23] to-[#131518] p-7 sm:p-9 shadow-2xl relative overflow-hidden text-ivory"
        >
          {/* Subtle warm gold ambient aura */}
          <div
            className="pointer-events-none absolute -right-20 -top-20 size-60 rounded-full bg-[#c5a059]/10 blur-3xl"
            aria-hidden="true"
          />

          <div className="relative z-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2
                id="hours-title"
                className="flex items-center gap-3 font-display text-2xl sm:text-3xl font-medium uppercase tracking-tight text-white"
              >
                <ClockIcon className="size-6 text-[#c5a059]" /> Öppettider
              </h2>
              <OpenStatus tone="dark" />
            </div>

            <div className="mt-6 space-y-6">
              {(Object.keys(hoursDisplay) as Season[])
                .sort((a) => (a === CURRENT_SEASON ? -1 : 1))
                .map((season) => (
                  <div
                    key={season}
                    className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-lg sm:text-xl font-semibold tracking-wide text-[#e0c98d]">
                        {seasonTitle[season]}
                      </h3>
                      {season === CURRENT_SEASON && (
                        <span className="rounded-full border border-[#c5a059]/40 bg-[#c5a059]/15 px-2.5 py-0.5 font-sans text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[#e0c98d]">
                          Gäller nu
                        </span>
                      )}
                    </div>
                    <dl className="mt-3 divide-y divide-white/[0.06]">
                      {hoursDisplay[season].map((row) => (
                        <div
                          key={row.days}
                          className="flex items-baseline justify-between gap-4 py-2 text-xs sm:text-sm"
                        >
                          <dt className="text-stone-300 font-medium">{row.days}</dt>
                          <dd className="tabular-nums font-mono text-white/90">
                            {row.time}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
            </div>
            <p className="mt-6 text-xs leading-relaxed text-[#a9adb5]">
              Helgdagar och särskilda stängningar meddelas här på hemsidan och via telefon.
            </p>
          </div>
        </section>
      </div>

      {/* Interactive Map Section */}
      <section aria-labelledby="map-title" className="py-12 sm:py-16 border-t border-[#e8e2d5]">
        <div className="wrap">
          <ContactMapHeader />
          <div className="rounded-3xl overflow-hidden border border-[#e4ded0] shadow-md">
            <MapEmbed />
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section aria-labelledby="faq-title" className="bg-[#f5f1e8] py-16 sm:py-20 border-t border-[#e8e2d5]" data-reveal="fade-up">
        <div className="wrap max-w-4xl">
          <div className="text-center">
            <p className={eyebrow}>Vanliga frågor</p>
            <h2
              id="faq-title"
              className="mt-1 font-display text-3xl sm:text-4xl lg:text-5xl font-normal uppercase tracking-tight text-[#14161a]"
            >
              Bra att veta
            </h2>
          </div>
          <div className="mt-8 space-y-3">
            {faqs.map((f) => (
              <details
                key={f.q}
                className="group rounded-2xl border border-[#e8e2d5] bg-white p-2 shadow-xs transition-colors hover:border-[#c5a059]"
              >
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-4 py-2 font-medium text-[#14161a] [&::-webkit-details-marker]:hidden">
                  <span className="text-sm sm:text-base font-semibold">{f.q}</span>
                  <span
                    aria-hidden="true"
                    className="relative block size-5 shrink-0 text-[#8a6d2b] transition-transform duration-200 group-open:rotate-45"
                  >
                    <span className="absolute left-0 top-1/2 block h-0.5 w-full -translate-y-1/2 rounded bg-current" />
                    <span className="absolute left-1/2 top-0 block h-full w-0.5 -translate-x-1/2 rounded bg-current" />
                  </span>
                </summary>
                <p className="px-4 pb-4 pt-1 text-xs sm:text-sm leading-relaxed text-[#5f636b]">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
