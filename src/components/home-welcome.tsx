import Image from "next/image";
import Link from "next/link";
import { ArrowIcon, FalconEmblem, PinIcon } from "@/components/icons";
import { eyebrow } from "@/components/ui";

export function HomeWelcome() {
  return (
    <section aria-labelledby="welcome-title" className="bg-[#fbf9f5] py-12 sm:py-20 border-y border-[#ede6da]">
      <div className="mx-auto w-full max-w-[1760px] px-3 sm:px-5 lg:px-7">
        
        {/* Top Header: Editorial Title & Story */}
        <div className="mx-auto max-w-3xl text-center mb-8 sm:mb-12">
          <div className="inline-flex items-center justify-center gap-2 mb-2 sm:mb-3">
            <span className="h-px w-8 bg-gold/60" />
            <FalconEmblem className="size-4 sm:size-5 text-gold shrink-0" />
            <span className="h-px w-8 bg-gold/60" />
          </div>
          <p className={eyebrow}>Välkommen till Falken</p>
          <h2
            id="welcome-title"
            className="mt-1.5 font-display text-2xl sm:text-4xl md:text-5xl font-normal uppercase tracking-wide text-ink leading-tight"
          >
            Där mathantverk möter <span className="text-gold-deep italic lowercase font-serif tracking-normal">varm</span> gemenskap
          </h2>
          <p className="mt-3 text-xs sm:text-base leading-relaxed text-muted max-w-2xl mx-auto">
            I hjärtat av Vintrosa skapar vi en plats där vänner och familjer samlas för att njuta av god mat.
            Från krispiga stenugnsbakade pizzor till saftiga kötträtter, fräscha sallader och klassisk à la carte – 
            alltid tillagat med noggrant utvalda råvaror och personlig omsorg.
          </p>
        </div>

        {/* Compact, Balanced Visual Grid (Restrained height on mobile so images NEVER blow up) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6 items-stretch">
          
          {/* Card 1: Restaurant Atmosphere (restaurant1.webp) */}
          <div className="md:col-span-7 relative group overflow-hidden rounded-2xl sm:rounded-3xl bg-[#1a1d22] shadow-lg ring-1 ring-black/5 h-56 sm:h-72 md:h-96 lg:h-[420px]">
            <Image
              src="/images/gallery/restaurant1.webp"
              alt="Restaurang Falken interiör och matsal i Vintrosa"
              fill
              loading="eager"
              sizes="(min-width: 768px) 58vw, 100vw"
              className="object-cover object-center transition-transform duration-500 group-hover:scale-[1.02]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
            
            <div className="absolute top-3.5 left-3.5 sm:top-5 sm:left-5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-md px-3 py-1 text-[0.68rem] sm:text-xs font-semibold uppercase tracking-[0.16em] text-gold border border-gold/30">
                <span className="size-1.5 rounded-full bg-gold animate-pulse" />
                Vår Restaurang
              </span>
            </div>

            <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 lg:p-8 text-ivory">
              <p className="text-[0.68rem] sm:text-xs font-semibold uppercase tracking-[0.2em] text-gold">Stämningsfull atmosfär</p>
              <h3 className="mt-1 font-display text-lg sm:text-2xl lg:text-3xl font-medium">En trivsam kväll i Vintrosa</h3>
              <p className="mt-1 sm:mt-2 text-[0.78rem] sm:text-xs lg:text-sm text-ivory/80 max-w-lg leading-relaxed line-clamp-2 sm:line-clamp-none">
                Slå dig ner i vår ombonade matsal på Skolgatan 4 för en god middag, en snabb lunch eller trevlig helgkväll.
              </p>
            </div>
          </div>

          {/* Card 2: Culinary Craftsmanship (oxfile-planka.webp) */}
          <div className="md:col-span-5 relative group overflow-hidden rounded-2xl sm:rounded-3xl bg-[#1a1d22] shadow-lg ring-1 ring-black/5 h-52 sm:h-64 md:h-96 lg:h-[420px]">
            <Image
              src="/images/gallery/oxfile-planka.webp?v=2"
              alt="Oxfilé på planka hos Restaurang Falken"
              fill
              sizes="(min-width: 768px) 42vw, 100vw"
              className="object-cover object-center transition-transform duration-500 group-hover:scale-[1.02]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
            
            <div className="absolute top-3.5 left-3.5 sm:top-5 sm:left-5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-md px-3 py-1 text-[0.68rem] sm:text-xs font-semibold uppercase tracking-[0.16em] text-gold border border-gold/30">
                Från Köket
              </span>
            </div>

            <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 lg:p-8 text-ivory">
              <p className="text-[0.68rem] sm:text-xs font-semibold uppercase tracking-[0.2em] text-gold">Klassisk À la Carte</p>
              <h3 className="mt-1 font-display text-lg sm:text-2xl lg:text-3xl font-medium">Oxfilé på planka & grill</h3>
              <p className="mt-1 sm:mt-2 text-[0.78rem] sm:text-xs lg:text-sm text-ivory/80 max-w-md leading-relaxed line-clamp-2 sm:line-clamp-none">
                Grillad oxfilé med hemlagad bearnaisesås, rödvinssås och spritsat duchessemos.
              </p>
            </div>
          </div>

        </div>

        {/* Bottom Refined Quick Links Bar */}
        <div className="mt-6 sm:mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl sm:rounded-2xl border border-line bg-white px-5 py-4 sm:px-7 sm:py-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs sm:text-sm text-muted">
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-gold" /> Stenugnsbakad pizza
            </span>
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-gold" /> Över 90 rätter
            </span>
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-gold" /> Avhämtning & servering
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/galleri"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-gold-deep hover:underline"
            >
              Se bildgalleriet <ArrowIcon className="size-3.5" />
            </Link>
            <span className="text-line" aria-hidden="true">|</span>
            <Link
              href="/kontakt"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-ink hover:text-gold-deep"
            >
              <PinIcon className="size-3.5 text-gold-deep" /> Hitta hit
            </Link>
          </div>
        </div>

      </div>
    </section>
  );
}
