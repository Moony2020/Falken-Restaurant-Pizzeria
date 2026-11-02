import Image from "next/image";
import { SearchIcon } from "@/components/icons";
import { OpenStatus } from "@/components/open-status";

interface MenuHeroProps {
  query: string;
  setQuery: (query: string) => void;
  disabled?: boolean;
}

export function MenuHero({ query, setQuery, disabled = false }: MenuHeroProps) {
  return (
    <section className="relative w-full overflow-hidden bg-[#0d0f12] py-12 sm:py-16 md:py-20 lg:py-22">
      {/* Background Hero Image */}
      <div className="pointer-events-none absolute inset-0 select-none overflow-hidden">
        {/* Right-aligned photo container: zoomed out (contained within height with breathing room) */}
        <div className="absolute inset-y-2 right-0 w-full sm:inset-y-4 md:inset-y-5 md:right-4 md:w-[80%] lg:inset-y-6 lg:right-6 lg:w-[72%] xl:right-10 xl:w-[68%]">
          <Image
            src="/images/menu/menu-hero.webp"
            alt="Falken Meny & Beställ – Oxfiléplanka och matupplevelse"
            fill
            priority
            quality={95}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 75vw, 68vw"
            className="object-cover object-[78%_center] md:object-contain md:object-right"
          />
        </div>

        {/* Desktop & Tablet shadow overlay: deep dark fade on the left behind text */}
        <div className="hidden md:block absolute inset-0 bg-gradient-to-r from-[#0d0f12] via-[#0d0f12]/85 via-42% to-transparent" />

        {/* Mobile atmospheric overlay: dark fade ensuring text clarity above steak photo */}
        <div className="md:hidden absolute inset-0 bg-gradient-to-t from-[#0d0f12] via-[#0d0f12]/85 via-50% to-[#0d0f12]/40" />

        {/* Soft bottom edge gradient for smooth transition */}
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0d0f12] to-transparent opacity-80" />
      </div>

      {/* Hero Content on the left */}
      <div className="wrap relative z-10 w-full">
        <div className="max-w-xl lg:max-w-2xl">
          {/* Eyebrow */}
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[#c5a059] sm:text-xs">
            AVHÄMTNING
          </p>

          {/* Main Title */}
          <h1 className="mt-2.5 font-display text-3xl min-[440px]:text-4xl sm:text-5xl md:text-6xl lg:text-[4.25rem] font-normal uppercase leading-[1.04] tracking-tight text-white drop-shadow-md">
            MENY &amp; BESTÄLL
          </h1>

          {/* Description */}
          <p className="mt-3.5 max-w-lg text-[0.95rem] leading-relaxed text-stone-300 sm:mt-4 sm:text-base">
            Välj din rätt, anpassa efter smak och hämta hos oss i Vintrosa.
            <br className="hidden sm:inline" /> Alla priser anges i kronor.
          </p>

          {/* Search Input matching mockup */}
          <div className="relative mt-7 w-full max-w-md sm:mt-8 sm:max-w-lg">
            <label htmlFor="menu-search" className="sr-only">
              Sök i menyn
            </label>
            <SearchIcon
              className="pointer-events-none absolute left-4.5 top-1/2 z-10 size-5 -translate-y-1/2 text-stone-400"
              aria-hidden="true"
            />
            <input
              id="menu-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Sök rätt, ingrediens eller nummer"
              disabled={disabled}
              className="h-12 sm:h-13 w-full rounded-full border border-white/20 bg-stone-900/60 pl-12 pr-5 text-sm sm:text-[0.95rem] text-white placeholder:text-stone-400 backdrop-blur-md transition duration-200 focus:border-[#c5a059] focus:bg-stone-950/80 focus:outline-none focus:ring-1 focus:ring-[#c5a059] disabled:opacity-50"
            />
          </div>

          {/* Live Restaurant Open Status underneath search bar */}
          <div className="mt-5 flex items-center sm:mt-6">
            <OpenStatus tone="dark" />
          </div>
        </div>
      </div>
    </section>
  );
}
