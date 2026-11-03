import Image from "next/image";
import Link from "next/link";
import { ClockIcon, PhoneIcon, PinIcon } from "@/components/icons";
import { OpenStatus } from "@/components/open-status";
import { mapsUrl, PREP_MINUTES, site } from "@/data/site";

export function ContactHero() {
  return (
    <section className="relative w-full overflow-hidden bg-[#FAF6EE] py-12 sm:py-16 lg:py-20">
      {/* Decorative luxury sweeping background curves matching the restaurant aesthetic */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        {/* Top right sweeping wave */}
        <svg
          className="absolute -right-16 -top-16 h-[460px] w-[560px] sm:h-[600px] sm:w-[700px] opacity-40 lg:opacity-50"
          viewBox="0 0 600 600"
          fill="none"
        >
          <path
            d="M200 0 C320 80 480 180 600 380 L600 0 Z"
            fill="url(#goldGradientTop)"
          />
          <path
            d="M120 0 C240 120 400 240 560 520 L600 520 L600 0 Z"
            fill="url(#goldGradientTop2)"
            opacity="0.5"
          />
          <defs>
            <linearGradient
              id="goldGradientTop"
              x1="200"
              y1="0"
              x2="600"
              y2="380"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#e8dac4" stopOpacity="0.7" />
              <stop offset="1" stopColor="#dfcbaf" stopOpacity="0.2" />
            </linearGradient>
            <linearGradient
              id="goldGradientTop2"
              x1="120"
              y1="0"
              x2="600"
              y2="520"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#f3e9db" stopOpacity="0.9" />
              <stop offset="1" stopColor="#e5d4bc" stopOpacity="0.3" />
            </linearGradient>
          </defs>
        </svg>

        {/* Bottom left sweeping wave */}
        <svg
          className="absolute -bottom-20 -left-20 h-[420px] w-[520px] sm:h-[520px] sm:w-[620px] opacity-40 lg:opacity-50"
          viewBox="0 0 600 600"
          fill="none"
        >
          <path
            d="M0 400 C150 420 300 480 450 600 L0 600 Z"
            fill="url(#goldGradientBottom)"
          />
          <path
            d="M0 280 C180 340 340 440 520 600 L0 600 Z"
            fill="url(#goldGradientBottom2)"
            opacity="0.4"
          />
          <defs>
            <linearGradient
              id="goldGradientBottom"
              x1="0"
              y1="400"
              x2="450"
              y2="600"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#e8dac4" stopOpacity="0.7" />
              <stop offset="1" stopColor="#dfcbaf" stopOpacity="0.2" />
            </linearGradient>
            <linearGradient
              id="goldGradientBottom2"
              x1="0"
              y1="280"
              x2="520"
              y2="600"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#f3e9db" stopOpacity="0.9" />
              <stop offset="1" stopColor="#e5d4bc" stopOpacity="0.3" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12 xl:gap-16">
          {/* Left Column: Heading, intro text, live status, quick info cards & action buttons */}
          <div className="lg:col-span-7 xl:col-span-7" data-reveal="fade-up">
            {/* Eyebrow */}
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[#a17a38] sm:text-xs">
              VÄLKOMMEN
            </p>

            {/* Main Title */}
            <h1 className="mt-2.5 font-display text-4xl font-normal uppercase leading-[1.04] tracking-tight text-stone-900 sm:text-5xl md:text-6xl lg:text-[4.25rem]">
              KONTAKT
            </h1>

            {/* Description */}
            <p className="mt-3.5 max-w-xl text-[0.95rem] leading-relaxed text-stone-600 sm:mt-4 sm:text-[1.05rem]">
              Ring, mejla eller titta förbi – vi finns i Vintrosa och tar gärna emot
              dina frågor.
            </p>

            {/* Live Open Status Badge */}
            <div className="mt-4 flex items-center sm:mt-5">
              <OpenStatus tone="light" />
            </div>

            {/* 3 Quick Contact Info Cards */}
            <div className="mt-6 grid grid-cols-1 gap-3 sm:mt-7 sm:grid-cols-3 sm:gap-3.5">
              {/* Card 1: Adress */}
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-2xl border border-[#ebe2d5] bg-white/95 p-3.5 shadow-sm transition-all duration-200 hover:border-[#c5a059] hover:bg-white hover:shadow-md cursor-pointer"
                aria-label={`Adress: ${site.address.street}, ${site.address.zip} ${site.address.city} (öppna vägbeskrivning)`}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#f7efe3] text-[#a67c38] transition-colors duration-200 group-hover:bg-[#c5a059] group-hover:text-white">
                  <PinIcon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.62rem] font-bold uppercase tracking-[0.16em] text-stone-400 sm:text-[0.65rem]">
                    ADRESS
                  </span>
                  <span className="mt-0.5 block text-xs font-semibold leading-snug text-stone-900 transition-colors group-hover:text-[#a67c38] sm:text-[0.82rem]">
                    {site.address.street},<br />
                    {site.address.zip} {site.address.city}
                  </span>
                </span>
              </a>

              {/* Card 2: Telefon */}
              <a
                href={site.phoneHref}
                className="group flex items-center gap-3 rounded-2xl border border-[#ebe2d5] bg-white/95 p-3.5 shadow-sm transition-all duration-200 hover:border-[#c5a059] hover:bg-white hover:shadow-md cursor-pointer"
                aria-label={`Telefon: ${site.phone} (ring restaurangen)`}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#f7efe3] text-[#a67c38] transition-colors duration-200 group-hover:bg-[#c5a059] group-hover:text-white">
                  <PhoneIcon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.62rem] font-bold uppercase tracking-[0.16em] text-stone-400 sm:text-[0.65rem]">
                    TELEFON
                  </span>
                  <span className="mt-0.5 block text-xs font-semibold leading-snug text-stone-900 transition-colors group-hover:text-[#a67c38] sm:text-[0.82rem]">
                    {site.phone}
                  </span>
                </span>
              </a>

              {/* Card 3: Avhämtning */}
              <Link
                href="/meny"
                className="group flex items-center gap-3 rounded-2xl border border-[#ebe2d5] bg-white/95 p-3.5 shadow-sm transition-all duration-200 hover:border-[#c5a059] hover:bg-white hover:shadow-md cursor-pointer"
                aria-label={`Avhämtning: ca ${PREP_MINUTES} minuter (öppna menyn och beställ)`}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#f7efe3] text-[#a67c38] transition-colors duration-200 group-hover:bg-[#c5a059] group-hover:text-white">
                  <ClockIcon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.62rem] font-bold uppercase tracking-[0.16em] text-stone-400 sm:text-[0.65rem]">
                    AVHÄMTNING
                  </span>
                  <span className="mt-0.5 block text-xs font-semibold leading-snug text-stone-900 transition-colors group-hover:text-[#a67c38] sm:text-[0.82rem]">
                    ca {PREP_MINUTES} min
                  </span>
                </span>
              </Link>
            </div>

            {/* Action Buttons: 2 equal buttons side-by-side on all screens with compact mobile sizing */}
            <div className="mt-7 flex items-center gap-2.5 sm:gap-4 sm:mt-8">
              {/* Primary: Ring restaurangen */}
              <a
                href={site.phoneHref}
                className="inline-flex flex-1 sm:flex-initial sm:min-w-[210px] min-h-10 sm:min-h-12 items-center justify-center gap-1.5 sm:gap-2.5 rounded-full border border-transparent bg-gradient-to-r from-[#c69f58] to-[#b78d42] px-3 sm:px-7 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold text-white shadow-md shadow-amber-950/10 transition-all duration-200 hover:from-[#b89148] hover:to-[#a77e34] hover:shadow-lg active:scale-[0.98] whitespace-nowrap"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-3.5 sm:size-4 shrink-0 fill-current"
                  aria-hidden="true"
                >
                  <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.61 21 3 13.39 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.24 1.01l-2.2 2.2z" />
                </svg>
                <span>Ring restaurangen</span>
              </a>

              {/* Secondary: Vägbeskrivning */}
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 sm:flex-initial sm:min-w-[210px] min-h-10 sm:min-h-12 items-center justify-center gap-1.5 sm:gap-2.5 rounded-full border border-[#c5a059] bg-white px-3 sm:px-7 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold text-stone-800 shadow-sm transition-all duration-200 hover:border-[#b88e44] hover:bg-[#faf5eb] hover:text-stone-900 hover:shadow active:scale-[0.98] whitespace-nowrap"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-3.5 sm:size-4 shrink-0 text-[#a67c38]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polygon points="3 11 22 2 13 21 11 13 3 11" />
                </svg>
                <span>Vägbeskrivning</span>
              </a>
            </div>
          </div>

          {/* Right Column: Hero photo with luxury rounded gold border */}
          <div className="lg:col-span-5 xl:col-span-5" data-reveal="fade-left" data-delay="150">
            <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
              <div className="relative overflow-hidden rounded-[2rem] border-[3px] border-[#c5a059] shadow-2xl shadow-stone-800/15 sm:rounded-[2.4rem] sm:border-[3.5px] lg:rounded-[2.8rem]">
                <div className="relative aspect-[4/3] w-full sm:aspect-[16/11] lg:aspect-[4/3]">
                  <Image
                    src="/images/gallery/matsalen.webp"
                    alt="Restaurang Falken matsal och interiör i Vintrosa"
                    fill
                    priority
                    quality={92}
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 45vw"
                    className="object-cover object-center"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

