"use client";

import { useRef } from "react";
import { ArrowIcon, FalconEmblem, GoogleIcon } from "@/components/icons";

interface Review {
  quote: string;
  author: string;
  role: string;
  detail?: string;
  source: string;
}

const reviewsGoogleUrl = "https://www.google.com/search?q=Restaurang+Falcken+Recensioner";

const reviews: Review[] = [
  {
    quote: "Mycket bra lunchmat och trevlig personal.",
    author: "Christian Granath",
    role: "Lokal gäst",
    detail: "Service: 5/5 • Mat: 4/5",
    source: "Google-recension",
  },
  {
    quote:
      "God svensk husmanskost med 3 olika alternativ, stor salladsbuffé och dricka. Hälsar glatt när man kommer till kassan.",
    author: "Robert Fält",
    role: "Lunchgäst",
    detail: "4 recensioner • 29 foton",
    source: "Google-recension",
  },
  {
    quote:
      "Själva salladen var fräsch och maten smakade bra. Lokalen fungerar toppen för en god och snabb lunch.",
    author: "Ulf Söderström",
    role: "Local Guide",
    detail: "1 800+ recensioner",
    source: "Google-recension",
  },
];

export function HomeReviews() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = (dir: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = dir === "left" ? -340 : 340;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  return (
    <section aria-labelledby="reviews-title" className="bg-[#fbf9f5] py-10 sm:py-16 border-b border-[#ede6da]">
      <div className="mx-auto w-full max-w-[1760px] px-3 sm:px-5 lg:px-7">
        
        {/* Section Header with Live Google Badge & Navigation Controls */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold-deep">
              Vad våra gäster säger
            </p>
            <h2
              id="reviews-title"
              className="mt-1 font-display text-2xl sm:text-4xl md:text-5xl font-normal uppercase tracking-wide text-ink"
            >
              Älskat av <span className="text-gold-deep italic lowercase font-serif tracking-normal">Vintrosa</span>
            </h2>
            
            {/* Real Google Rating Badge from Google Business Profile */}
            <div className="mt-2 sm:mt-2.5">
              <a
                href={reviewsGoogleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-1.5 sm:gap-2 rounded-full border border-gold/30 bg-white px-3 py-1.5 text-xs font-medium text-ink shadow-xs transition-all duration-200 hover:border-gold hover:shadow-sm"
              >
                <GoogleIcon className="size-3.5 shrink-0" />
                <span className="font-bold text-ink">4,4 / 5</span>
                <span className="text-gold-deep tracking-wider font-bold text-[0.7rem]">★★★★★</span>
                <span className="text-line" aria-hidden="true">|</span>
                <span className="text-muted group-hover:text-gold-deep transition-colors text-[11px] sm:text-xs">340 recensioner på Google</span>
                <ArrowIcon className="size-2.5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-gold-deep" />
              </a>
            </div>
          </div>

          {/* Carousel Arrow Controls (Tiny & compact on mobile, positioned beside header on sm+) */}
          <div className="flex items-center gap-1.5 self-end sm:self-auto lg:hidden">
            <button
              type="button"
              onClick={() => handleScroll("left")}
              aria-label="Föregående recension"
              className="size-7 sm:size-8 rounded-full border border-[#ede6da] bg-white flex items-center justify-center text-ink shadow-xs transition-all hover:border-gold hover:bg-[#fbf9f5] active:scale-95"
            >
              <ArrowIcon className="size-3 rotate-180" />
            </button>
            <button
              type="button"
              onClick={() => handleScroll("right")}
              aria-label="Nästa recension"
              className="size-7 sm:size-8 rounded-full border border-[#ede6da] bg-white flex items-center justify-center text-ink shadow-xs transition-all hover:border-gold hover:bg-[#fbf9f5] active:scale-95"
            >
              <ArrowIcon className="size-3" />
            </button>
          </div>
        </div>

        {/* Responsive Horizontal Scroll Carousel (Generous width on mobile, 3-cols on Desktop) */}
        <div
          ref={scrollRef}
          className="flex gap-4 sm:gap-6 overflow-x-auto snap-x snap-mandatory pb-4 pt-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:grid-cols-3 lg:overflow-visible lg:pb-0"
        >
          {reviews.map((r, i) => (
            <div
              key={i}
              className="relative w-[84vw] min-w-[300px] max-w-[350px] sm:w-[380px] sm:max-w-[420px] lg:w-auto lg:max-w-none shrink-0 snap-start rounded-2xl sm:rounded-3xl border border-[#ede6da] bg-white p-6 sm:p-8 shadow-sm transition-all duration-300 hover:shadow-md hover:border-gold/40 flex flex-col justify-between overflow-hidden"
            >
              {/* Subtle Watermark Falcon in Card */}
              <div className="pointer-events-none absolute -right-4 -bottom-4 select-none text-gold/[0.05]" aria-hidden="true">
                <FalconEmblem className="size-32" />
              </div>

              <div className="relative z-10">
                {/* 5 Stars */}
                <div className="flex items-center gap-1 text-gold-deep text-sm tracking-wider">
                  {"★★★★★"}
                </div>

                {/* Real Quote with comfortable font size and line height */}
                <p className="mt-4 text-sm sm:text-base text-ink/85 leading-relaxed italic font-serif">
                  &ldquo;{r.quote}&rdquo;
                </p>
              </div>

              {/* Author & Source */}
              <div className="relative z-10 mt-6 pt-4 border-t border-[#ede6da] flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm font-semibold text-ink">{r.author}</p>
                  <p className="text-[0.7rem] text-muted">
                    {r.role} {r.detail && `• ${r.detail}`}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 text-[0.68rem] font-medium text-gold-deep bg-gold/10 px-2.5 py-1 rounded-full border border-gold/20">
                  <GoogleIcon className="size-3" />
                  <span>Google</span>
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* CTA to view all reviews on Google */}
        <div className="mt-8 text-center">
          <a
            href={reviewsGoogleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-gold-deep hover:underline"
          >
            <span>Läs alla 340 recensioner på Google</span>
            <ArrowIcon className="size-3.5" />
          </a>
        </div>

      </div>
    </section>
  );
}
