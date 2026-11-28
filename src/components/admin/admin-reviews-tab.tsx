"use client";

import { useState } from "react";
import { ArrowIcon, CheckIcon, FalconEmblem, GoogleIcon } from "@/components/icons";

interface FeaturedReview {
  id: string;
  author: string;
  role: string;
  detail: string;
  rating: number;
  quote: string;
  source: string;
  date: string;
}

const FEATURED_REVIEWS: FeaturedReview[] = [
  {
    id: "rev-1",
    author: "Christian Granath",
    role: "Lokal gäst",
    detail: "Service: 5/5 • Mat: 4/5",
    rating: 5,
    quote: "Mycket bra lunchmat och trevlig personal.",
    source: "Google-recension",
    date: "Verifierad gäst",
  },
  {
    id: "rev-2",
    author: "Robert Fält",
    role: "Lunchgäst",
    detail: "4 recensioner • 29 foton",
    rating: 5,
    quote: "God svensk husmanskost med 3 olika alternativ, stor salladsbuffé och dricka. Hälsar glatt när man kommer till kassan.",
    source: "Google-recension",
    date: "Verifierad gäst",
  },
  {
    id: "rev-3",
    author: "Ulf Söderström",
    role: "Local Guide",
    detail: "1 800+ recensioner",
    rating: 5,
    quote: "Själva salladen var fräsch och maten smakade bra. Lokalen fungerar toppen för en god och snabb lunch.",
    source: "Google-recension",
    date: "Google Local Guide",
  },
];

const GOOGLE_REVIEWS_URL = "https://www.google.com/search?q=Restaurang+Falcken+Recensioner";

export function AdminReviewsTab() {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(GOOGLE_REVIEWS_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback if clipboard API is not available
      const input = document.createElement("input");
      input.value = GOOGLE_REVIEWS_URL;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="w-full space-y-6 sm:space-y-8 pb-12">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#e8e2d5] pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a78347]">Kundnöjdhet &amp; Rykte</p>
          <h2 className="mt-1 font-serif text-2xl sm:text-3xl font-bold text-[#1f2328]">Betyg &amp; Omdömen</h2>
          <p className="mt-1 text-xs text-[#7c828d]">
            Hantera restaurangens gästomdömen från Google och hur de presenteras för besökare på webbplatsen.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={GOOGLE_REVIEWS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-[#a78347] px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#96743b]"
          >
            <GoogleIcon className="size-4 shrink-0" />
            <span>Öppna på Google</span>
            <ArrowIcon className="size-3" />
          </a>
        </div>
      </header>

      {/* Review summary cards */}
      <section aria-label="Omdömesstatistik" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Card 1: Snittbetyg */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#e7e1d5] bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#7c828d]">Snittbetyg</span>
            <span className="rounded-full bg-[#fdf8ee] px-2 py-0.5 text-xs text-[#a78347]">★ Google</span>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-3xl font-bold text-[#1f2328]">4,4</span>
              <span className="text-sm font-medium text-[#7c828d]">/ 5.0</span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-sm text-[#a78347]">
              <span>★★★★★</span>
              <span className="text-xs text-[#7c828d] ml-1">Utmärkt</span>
            </div>
          </div>
          <p className="mt-3 border-t border-[#f2ede4] pt-2 text-[11px] text-[#7c828d]">
            Baserat på kundrecensioner på Google
          </p>
        </div>

        {/* Card 2: Totalt antal */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#e7e1d5] bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#7c828d]">Totalt recensioner</span>
            <span className="rounded-full bg-[#f0fdf4] px-2 py-0.5 text-[10px] font-semibold text-[#15803d]">Google</span>
          </div>
          <div className="mt-3">
            <span className="font-serif text-3xl font-bold text-[#1f2328]">340+</span>
            <p className="mt-1 text-xs text-[#7c828d]">Registrerade på Google Sök &amp; Maps</p>
          </div>
          <p className="mt-3 border-t border-[#f2ede4] pt-2 text-[11px] text-[#7c828d]">
            Visas som en statisk uppgift
          </p>
        </div>

        {/* Card 3: Status webbplats */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#e7e1d5] bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#7c828d]">Startsida display</span>
            <span className="rounded-full bg-[#f0fdf4] px-2 py-0.5 text-[10px] font-semibold text-[#15803d]">Aktiv</span>
          </div>
          <div className="mt-3">
            <span className="font-serif text-3xl font-bold text-[#1f2328]">3 st</span>
            <p className="mt-1 text-xs text-[#7c828d]">Utvalda citat visas på startsidan</p>
          </div>
          <p className="mt-3 border-t border-[#f2ede4] pt-2 text-[11px] text-[#7c828d]">
            Länk leder gästen direkt till alla 340 omdömen
          </p>
        </div>
      </section>

      {/* Guide Section: Hur omdömen fungerar och hur kunder skriver recensioner */}
      <section aria-labelledby="reviews-flow-title" className="rounded-2xl border border-[#e7e1d5] bg-white p-6 shadow-xs space-y-6">
        <div className="border-b border-[#f1ede3] pb-3">
          <div className="flex items-center gap-2">
            <FalconEmblem className="h-5 w-5 text-[#a78347]" />
            <h3 id="reviews-flow-title" className="text-sm font-bold text-[#1f2328] uppercase tracking-wide">
              Hur omdömessystemet fungerar
            </h3>
          </div>
          <p className="mt-1 text-xs text-[#7c828d]">
            Svar på hur recensioner samlas in, varför Google används och hur du delar länken med gäster.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Step 1 */}
          <div className="rounded-xl border border-[#ece6da] bg-[#faf8f4] p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#a78347] text-xs font-bold text-white">
                1
              </span>
              <h4 className="text-xs font-bold text-[#1f2328] uppercase">Varför Google Recensioner?</h4>
            </div>
            <p className="text-xs text-[#555a64] leading-relaxed">
            Falken visar ett urval av Google-recensioner i stället för ett eget recensionsformulär. Besökare kan följa Google-länken för att läsa fler omdömen eller skriva en egen recension.
            </p>
          </div>

          {/* Step 2 */}
          <div className="rounded-xl border border-[#ece6da] bg-[#faf8f4] p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#a78347] text-xs font-bold text-white">
                2
              </span>
              <h4 className="text-xs font-bold text-[#1f2328] uppercase">Hur kunden skriver omdöme</h4>
            </div>
            <p className="text-xs text-[#555a64] leading-relaxed">
              På webbplatsen finns sektionen <em>&rdquo;Vad våra gäster säger&rdquo;</em> med en länk till Google. Där kan gästen läsa omdömen och, via Google, välja att skriva en egen recension.
            </p>
          </div>

          {/* Step 3 */}
          <div className="rounded-xl border border-[#ece6da] bg-[#faf8f4] p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#a78347] text-xs font-bold text-white">
                3
              </span>
              <h4 className="text-xs font-bold text-[#1f2328] uppercase">Dela länk med gäster</h4>
            </div>
            <p className="text-xs text-[#555a64] leading-relaxed">
              Kopiera länken nedan och dela den med gäster via valfri kanal, till exempel SMS eller ett digitalt kvitto. En QR-kod kan skapas separat om ni vill använda en.
            </p>
          </div>
        </div>

        {/* Shareable Link Box */}
        <div className="rounded-xl border border-[#e4ded2] bg-[#fbf9f5] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-bold text-[#1f2328]">Google-länk till restaurangens recensioner:</p>
            <p className="text-xs text-[#7c828d] font-mono select-all break-all">{GOOGLE_REVIEWS_URL}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#d8d0c2] bg-white px-4 py-2 text-xs font-semibold text-[#1f2328] shadow-xs hover:bg-[#faf8f4] transition cursor-pointer"
            >
              {copied ? (
                <>
                  <CheckIcon className="size-3.5 text-[#15803d]" />
                  <span className="text-[#15803d]">Kopierad till urklipp!</span>
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="size-3.5 text-[#7c828d]" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Kopiera Google-länk</span>
                </>
              )}
            </button>

            <a
              href={GOOGLE_REVIEWS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-xl bg-[#a78347] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#96743b] transition"
            >
              <span>Testa länk</span>
              <ArrowIcon className="size-3" />
            </a>
          </div>
        </div>
      </section>

      {/* Featured Reviews Cards Section */}
      <section aria-labelledby="featured-reviews-title" className="rounded-2xl border border-[#e7e1d5] bg-white p-6 shadow-xs space-y-5">
        <div className="border-b border-[#f1ede3] pb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 id="featured-reviews-title" className="text-sm font-bold text-[#1f2328] uppercase tracking-wide">
              Utvalda Google-recensioner på startsidan
            </h3>
            <p className="text-xs text-[#7c828d]">
              Dessa utvalda citat visas på webbplatsen. De hanteras manuellt och synkroniseras inte automatiskt med Google.
            </p>
          </div>
          <span className="rounded-full bg-[#fdf8ee] px-3 py-1 text-xs font-semibold text-[#a78347]">
            3 aktiva citat
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {FEATURED_REVIEWS.map((rev) => (
            <div
              key={rev.id}
              className="flex flex-col justify-between rounded-xl border border-[#e8e2d5] bg-[#faf8f4] p-5 shadow-xs space-y-4"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-0.5 text-sm text-[#a78347]">
                    {"★".repeat(rev.rating)}
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white border border-[#e4ded2] px-2 py-0.5 text-[10px] font-medium text-[#7c828d]">
                    <GoogleIcon className="size-2.5" />
                    <span>{rev.source}</span>
                  </span>
                </div>

                <p className="mt-3 text-xs italic text-[#1f2328] leading-relaxed font-serif">
                  &ldquo;{rev.quote}&rdquo;
                </p>
              </div>

              <div className="border-t border-[#ece6da] pt-3 flex items-center justify-between text-xs">
                <div>
                  <p className="font-semibold text-[#1f2328]">{rev.author}</p>
                  <p className="text-[10px] text-[#7c828d]">{rev.role} {rev.detail ? `· ${rev.detail}` : ""}</p>
                </div>
                <span className="text-[10px] text-[#a78347] font-medium">{rev.date}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Review data source notice */}
      <section className="rounded-2xl border border-[#e8e2d5] bg-[#faf8f4] p-5 text-xs text-[#555a64] space-y-2">
        <div className="flex items-center gap-2 text-[#1f2328] font-bold">
          <span>💡 Om uppgifterna och citaten</span>
        </div>
        <p className="leading-relaxed">
          Betyg, antal recensioner och utvalda citat visas som innehåll i webbplatsen och uppdateras inte automatiskt från Google. En eventuell framtida integration kan hämta tillgängliga uppgifter från Google efter att den har konfigurerats.
        </p>
      </section>
    </div>
  );
}
