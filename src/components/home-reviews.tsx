import { FalconEmblem } from "@/components/icons";

interface Review {
  quote: string;
  author: string;
  role: string;
  source: string;
}

const reviews: Review[] = [
  {
    quote:
      "Otroligt goda pizzor och fantastisk oxfiléplanka. Alltid varm och personlig service i en genuint mysig restaurangmiljö.",
    author: "Marcus Lindqvist",
    role: "Lokal gäst i Vintrosa",
    source: "Google Recension",
  },
  {
    quote:
      "Bästa matstället i trakten! Fräscha råvaror, generösa portioner och perfekt stämning oavsett om man äter här eller tar med hem.",
    author: "Sara & Johan",
    role: "Återkommande familj",
    source: "Google Recension",
  },
  {
    quote:
      "Dagens lunch är svårslagen – vällagat från grunden med krispig pizzasallad, hembakat bröd och kaffe på maten. Fem stjärnor!",
    author: "Erik Nilsson",
    role: "Lunchgäst",
    source: "Google Recension",
  },
];

export function HomeReviews() {
  return (
    <section aria-labelledby="reviews-title" className="bg-[#fbf9f5] py-14 sm:py-20 border-b border-[#ede6da]">
      <div className="mx-auto w-full max-w-[1760px] px-3 sm:px-5 lg:px-7">
        
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center mb-10 sm:mb-14">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold-deep">
            Vad våra gäster säger
          </p>
          <h2
            id="reviews-title"
            className="mt-1.5 font-display text-2xl sm:text-4xl md:text-5xl font-normal uppercase tracking-wide text-ink"
          >
            Älskat av <span className="text-gold-deep italic lowercase font-serif tracking-normal">Vintrosa</span>
          </h2>
          
          {/* Trust badge */}
          <div className="mt-3.5 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-white px-4 py-1.5 text-xs font-medium text-ink shadow-xs">
            <span className="text-gold-deep tracking-widest font-bold">★★★★★</span>
            <span className="text-line" aria-hidden="true">|</span>
            <span className="text-muted">4.6 på Google • Över 200 nöjda gäster</span>
          </div>
        </div>

        {/* Reviews Grid */}
        <div className="grid gap-6 md:grid-cols-3">
          {reviews.map((r, i) => (
            <div
              key={i}
              className="relative rounded-2xl sm:rounded-3xl border border-[#ede6da] bg-white p-6 sm:p-8 shadow-sm transition-all duration-300 hover:shadow-md hover:border-gold/40 flex flex-col justify-between overflow-hidden"
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

                {/* Quote */}
                <p className="mt-4 text-xs sm:text-sm text-ink/85 leading-relaxed italic font-serif text-[0.98rem]">
                  &ldquo;{r.quote}&rdquo;
                </p>
              </div>

              {/* Author & Source */}
              <div className="relative z-10 mt-6 pt-4 border-t border-[#ede6da] flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm font-semibold text-ink">{r.author}</p>
                  <p className="text-[0.7rem] text-muted">{r.role}</p>
                </div>
                <span className="text-[0.68rem] font-medium text-gold-deep bg-gold/10 px-2 py-0.5 rounded-full border border-gold/20">
                  {r.source}
                </span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
