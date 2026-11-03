import Image from "next/image";
import Link from "next/link";
import {
  ArrowIcon,
  FalconEmblem,
  FeatureFoodIcon,
  FeatureAmbianceIcon,
  FeatureLocationIcon,
} from "@/components/icons";
import { eyebrow } from "@/components/ui";

export function HomeWelcome() {
  return (
    <section aria-labelledby="welcome-title" className="bg-[#fbf9f5] pt-7 pb-12 sm:pt-11 sm:pb-16 lg:pt-12 lg:pb-20 border-y border-[#ede6da]">
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

        {/* Refined Feature Showcase: Photo on Left with Small Glassy Card, "MER ÄN BARA MAT" on Right */}
        <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-[#ede6da] bg-white shadow-sm transition-all duration-300 hover:shadow-md">
          <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
            
            {/* Left Side (50%): Photo with Small Floating Glassy Card */}
            <div className="lg:col-span-6 relative min-h-[320px] sm:min-h-[400px] lg:min-h-[490px] w-full overflow-hidden bg-[#1a1d22]">
              <Image
                src="/images/gallery/restaurant1.webp"
                alt="Restaurang Falken interiör och matsal i Vintrosa"
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover object-center transition-transform duration-700 hover:scale-[1.02]"
              />

              {/* Small Glassy Card in bottom-left corner */}
              <div className="absolute bottom-3.5 left-3.5 sm:bottom-5 sm:left-5 z-10 max-w-[260px] sm:max-w-[310px]">
                <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-black/60 backdrop-blur-xl border border-gold/35 p-3.5 sm:p-4 text-ivory shadow-2xl transition-all duration-300 hover:border-gold/55 hover:bg-black/65">
                  {/* Subtle Falcon Watermark */}
                  <div className="pointer-events-none absolute -right-2 -bottom-2 select-none text-gold/15" aria-hidden="true">
                    <FalconEmblem className="size-16 sm:size-20" />
                  </div>

                  <div className="relative z-10">
                    <p className="text-[0.62rem] sm:text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-gold">
                      Stämningsfull atmosfär
                    </p>
                    <h4 className="mt-0.5 font-display text-sm sm:text-base font-medium tracking-wide text-ivory">
                      En trivsam kväll i Vintrosa
                    </h4>
                    <p className="mt-1 text-[0.7rem] sm:text-xs text-ivory/80 leading-relaxed">
                      Slå dig ner i vår ombonade matsal på Skolgatan 4 för en god middag eller lunch.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side (50%): "MER ÄN BARA MAT", 3 Icons, Button */}
            <div className="lg:col-span-6 relative p-6 sm:p-9 lg:p-10 xl:p-12 flex flex-col justify-center bg-white overflow-hidden">
              
              {/* Watermark Falcon Silhouette */}
              <div className="pointer-events-none absolute -right-6 -top-6 sm:-right-8 sm:-top-8 select-none text-gold/[0.08]" aria-hidden="true">
                <FalconEmblem className="size-48 sm:size-64 lg:size-72" />
              </div>

              <div className="relative z-10">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-deep">
                  Vår restaurang
                </p>
                <h3 className="mt-2 font-display text-2xl sm:text-3xl lg:text-[2.25rem] font-normal uppercase tracking-wide text-ink leading-tight">
                  Mer än bara mat
                </h3>
                <p className="mt-3 text-xs sm:text-sm lg:text-[0.92rem] leading-relaxed text-muted max-w-lg">
                  En trivsam restaurang i Vintrosa där god mat, varm service och en avslappnad atmosfär möts. Perfekt för både vardag och helg.
                </p>

                {/* 3 Circular Value Badges */}
                <div className="mt-7 sm:mt-8 pt-5 sm:pt-6 border-t border-[#ede6da] grid grid-cols-3 gap-2 sm:gap-4 items-center">
                  <div className="flex flex-col items-center text-center">
                    <div className="size-11 sm:size-12 rounded-full border border-gold/40 bg-gold/5 flex items-center justify-center text-gold-deep transition-transform duration-300 hover:scale-105">
                      <FeatureFoodIcon className="size-5 sm:size-6" />
                    </div>
                    <span className="mt-2 text-[0.72rem] sm:text-xs font-medium text-ink">God mat</span>
                  </div>

                  <div className="flex flex-col items-center text-center border-x border-[#ede6da]/80 px-1 sm:px-2">
                    <div className="size-11 sm:size-12 rounded-full border border-gold/40 bg-gold/5 flex items-center justify-center text-gold-deep transition-transform duration-300 hover:scale-105">
                      <FeatureAmbianceIcon className="size-5 sm:size-6" />
                    </div>
                    <span className="mt-2 text-[0.72rem] sm:text-xs font-medium text-ink">Trevlig miljö</span>
                  </div>

                  <div className="flex flex-col items-center text-center">
                    <div className="size-11 sm:size-12 rounded-full border border-gold/40 bg-gold/5 flex items-center justify-center text-gold-deep transition-transform duration-300 hover:scale-105">
                      <FeatureLocationIcon className="size-5 sm:size-6" />
                    </div>
                    <span className="mt-2 text-[0.72rem] sm:text-xs font-medium text-ink">Centralt i Vintrosa</span>
                  </div>
                </div>

                {/* CTA Button */}
                <div className="mt-7 sm:mt-8">
                  <Link
                    href="/galleri"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-gold via-[#d4af37] to-gold-deep text-ink font-semibold text-xs sm:text-sm px-6 sm:px-7 py-2.5 sm:py-3 shadow-sm transition-all duration-200 hover:shadow-md hover:brightness-105 active:scale-[0.98]"
                  >
                    Se galleriet <ArrowIcon className="size-4" />
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
