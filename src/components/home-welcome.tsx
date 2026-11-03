import Image from "next/image";
import Link from "next/link";
import { ArrowIcon, FalconEmblem } from "@/components/icons";
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

        {/* Panoramic Restaurant Atmosphere with Floating Glassmorphism Card */}
        <div className="relative group overflow-hidden rounded-2xl sm:rounded-3xl bg-[#1a1d22] shadow-xl ring-1 ring-black/5 min-h-[420px] sm:min-h-[480px] lg:min-h-[520px] flex flex-col justify-between p-4 sm:p-8 lg:p-10">
          
          {/* Full-bleed background photo */}
          <Image
            src="/images/gallery/restaurant1.webp"
            alt="Restaurang Falken interiör och matsal i Vintrosa"
            fill
            sizes="(min-width: 1760px) 1760px, 100vw"
            className="object-cover object-center transition-transform duration-700 group-hover:scale-[1.02]"
          />

          {/* Top Left Badge */}
          <div className="relative z-10">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-md px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-gold border border-gold/30 shadow-md">
              <span className="size-1.5 rounded-full bg-gold animate-pulse" />
              Vår Restaurang
            </span>
          </div>

          {/* Bottom Left Floating Glassmorphism Card */}
          <div className="relative z-10 max-w-lg mt-auto">
            <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-black/50 backdrop-blur-xl border border-gold/30 p-6 sm:p-8 text-ivory shadow-2xl transition-all duration-300 hover:border-gold/50 hover:bg-black/55">
              
              {/* Subtle Falcon Watermark in the bottom-right of the glass card */}
              <div className="pointer-events-none absolute -right-3 -bottom-3 select-none text-gold/15" aria-hidden="true">
                <FalconEmblem className="size-28 sm:size-36" />
              </div>

              <div className="relative z-10">
                <p className="text-[0.7rem] sm:text-xs font-semibold uppercase tracking-[0.22em] text-gold">
                  Stämningsfull atmosfär
                </p>
                <h3 className="mt-1.5 font-display text-xl sm:text-2xl lg:text-3xl font-medium tracking-wide text-ivory">
                  En trivsam kväll i Vintrosa
                </h3>
                <p className="mt-2.5 text-xs sm:text-sm text-ivory/85 leading-relaxed">
                  Slå dig ner i vår ombonade matsal på Skolgatan 4 för en god middag, en snabb lunch eller en trevlig helgkväll.
                </p>
                
                <div className="mt-5 pt-3.5 border-t border-white/10 flex items-center justify-between">
                  <Link
                    href="/galleri"
                    className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-gold hover:text-gold-light transition-colors group/link"
                  >
                    <span>Upptäck vår miljö</span>
                    <ArrowIcon className="size-4 transition-transform group-hover/link:translate-x-1" />
                  </Link>
                </div>
              </div>

            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
