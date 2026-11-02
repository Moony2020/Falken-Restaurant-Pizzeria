import Image from "next/image";
import Link from "next/link";
import { ArrowIcon, FalconEmblem, PinIcon, PhoneIcon } from "@/components/icons";
import { buttonClass, eyebrow } from "@/components/ui";
import { site } from "@/data/site";

export function HomeWelcome() {
  return (
    <section aria-labelledby="welcome-title" className="bg-[#fbf9f5] py-16 sm:py-24 border-y border-[#ede6da]">
      <div className="mx-auto w-full max-w-[1760px] px-3 sm:px-5 lg:px-7">
        
        {/* Top Header: Editorial Title & Story */}
        <div className="mx-auto max-w-3xl text-center mb-12 sm:mb-16">
          <div className="inline-flex items-center justify-center gap-2 mb-3">
            <span className="h-px w-8 bg-gold/60" />
            <FalconEmblem className="size-5 text-gold shrink-0" />
            <span className="h-px w-8 bg-gold/60" />
          </div>
          <p className={eyebrow}>Välkommen till Falken</p>
          <h2
            id="welcome-title"
            className="mt-2 font-display text-3xl sm:text-4xl md:text-5xl font-normal uppercase tracking-wide text-ink leading-tight"
          >
            Där mathantverk möter <span className="text-gold-deep italic lowercase font-serif tracking-normal">varm</span> gemenskap
          </h2>
          <p className="mt-4 text-sm sm:text-base leading-relaxed text-muted max-w-2xl mx-auto">
            I hjärtat av Vintrosa skapar vi en plats där vänner och familjer samlas för att njuta av god mat.
            Från krispiga pizzor bakade från grunden till saftiga kötträtter, fräscha sallader och klassisk husman – 
            alltid tillagat med noggrant utvalda råvaror och personlig omsorg.
          </p>
        </div>

        {/* Asymmetric Visual Grid: Inspired by Editorial Luxury Design */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 mb-12 sm:mb-16">
          
          {/* Main Feature: Tall Atmosphere Photo (restaurant1.webp) */}
          <div className="lg:col-span-7 relative group overflow-hidden rounded-3xl bg-ink shadow-xl ring-1 ring-black/5 aspect-[4/5] sm:aspect-[16/11] lg:aspect-auto lg:min-h-[560px]">
            <Image
              src="/images/gallery/restaurant1.webp"
              alt="Restaurang Falken interiör och matsal"
              fill
              sizes="(min-width: 1024px) 60vw, 100vw"
              className="object-cover object-center transition-transform duration-700 group-hover:scale-[1.03]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
            
            {/* Overlay badge & caption */}
            <div className="absolute top-5 left-5">
              <span className="inline-flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-md px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-gold border border-gold/30">
                <span className="size-1.5 rounded-full bg-gold animate-pulse" />
                Vår Restaurang
              </span>
            </div>

            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8 text-ivory">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold">Stämningsfull atmosfär</p>
              <h3 className="mt-1 font-display text-2xl sm:text-3xl font-medium">En trivsam kväll att minnas</h3>
              <p className="mt-2 text-xs sm:text-sm text-ivory/80 max-w-lg leading-relaxed">
                Slå dig ner i vår ombonade matsal för en trevlig middag, en snabb lunch med kollegorna eller en festlig helgkväll.
              </p>
            </div>
          </div>

          {/* Right Side: 2 Stacked Cards (Food Craftsmanship & Dining Room) */}
          <div className="lg:col-span-5 flex flex-col gap-5 sm:gap-6 justify-between">
            
            {/* Card 1: Culinary Craft */}
            <div className="relative group overflow-hidden rounded-3xl bg-ink shadow-lg ring-1 ring-black/5 aspect-[16/10] lg:aspect-auto lg:h-[268px]">
              <Image
                src="/images/dishes/alacarte/oxfile-planka.webp"
                alt="À la carte hos Falken"
                fill
                sizes="(min-width: 1024px) 40vw, 100vw"
                className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
              <div className="absolute bottom-0 inset-x-0 p-5 sm:p-6 text-ivory">
                <span className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-gold">Från köket</span>
                <h4 className="font-display text-xl sm:text-2xl font-medium text-white">Klassisk à la carte & grill</h4>
                <p className="text-xs text-ivory/75 mt-1">Plankstek, saftiga filéer och noga komponerade såser.</p>
              </div>
            </div>

            {/* Card 2: Matsalen & Gemenskap */}
            <div className="relative group overflow-hidden rounded-3xl bg-ink shadow-lg ring-1 ring-black/5 aspect-[16/10] lg:aspect-auto lg:h-[268px]">
              <Image
                src="/images/gallery/matsalen.webp"
                alt="Matsalen i Vintrosa"
                fill
                sizes="(min-width: 1024px) 40vw, 100vw"
                className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
              <div className="absolute bottom-0 inset-x-0 p-5 sm:p-6 text-ivory">
                <span className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-gold">Vintrosa</span>
                <h4 className="font-display text-xl sm:text-2xl font-medium text-white">Matsalen på Skolgatan 4</h4>
                <p className="text-xs text-ivory/75 mt-1">Plats för både små och stora sällskap i varm miljö.</p>
              </div>
            </div>

          </div>

        </div>

        {/* Bottom Feature Card: "Upptäck Upplevelsen" (Dark Luxury Banner like Inspiration) */}
        <div className="overflow-hidden rounded-3xl bg-[#14161a] text-ivory shadow-2xl border border-white/10">
          <div className="grid grid-cols-1 md:grid-cols-12 items-center">
            
            {/* Image side */}
            <div className="md:col-span-5 relative h-64 sm:h-72 md:h-full min-h-[260px] overflow-hidden">
              <Image
                src="/images/dishes/pizza/falken-special.webp"
                alt="Falken Special stenugnsbakad pizza"
                fill
                sizes="(min-width: 768px) 45vw, 100vw"
                className="object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#14161a]/90 hidden md:block" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#14161a] to-transparent md:hidden" />
            </div>

            {/* Text & Actions side */}
            <div className="md:col-span-7 p-7 sm:p-10 lg:p-12">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-gold mb-2">
                <FalconEmblem className="size-4" />
                <span>Upptäck Falken</span>
              </div>
              <h3 className="font-display text-2xl sm:text-3xl lg:text-4xl font-normal uppercase text-white">
                Alltid nylagat för avhämtning eller servering
              </h3>
              <p className="mt-3 text-sm text-ivory/75 leading-relaxed max-w-xl">
                Se fler bilder från restaurangen, upptäck vårt kompletta utbud på över 90 rätter, eller beställ smidigt online och hämta nylagat hos oss på Skolgatan 4.
              </p>

              {/* Quick highlights */}
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-ivory/90">
                <div className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-gold shrink-0" />
                  <span>Stenugnsbakad pizza</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-gold shrink-0" />
                  <span>Över 90 rätter</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-gold shrink-0" />
                  <span>Klara på ca 10–15 min</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/galleri"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition-all bg-gold text-ink hover:bg-gold-light shadow-md"
                >
                  Se galleriet <ArrowIcon className="size-4" />
                </Link>
                <Link
                  href="/kontakt"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition-all border border-gold/70 text-gold hover:bg-gold hover:text-ink"
                >
                  <PinIcon className="size-4" /> Hitta till oss
                </Link>
                <a
                  href={site.phoneHref}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium text-ivory/80 hover:text-white transition-colors"
                >
                  <PhoneIcon className="size-4 text-gold" /> {site.phone}
                </a>
              </div>

            </div>

          </div>
        </div>

      </div>
    </section>
  );
}
