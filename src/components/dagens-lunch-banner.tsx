import Image from "next/image";
import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { dagensLunch } from "@/data/site";
import { kr } from "@/lib/pricing";

export function DagensLunchBanner() {
  return (
    <section aria-labelledby="lunch-title" className="mx-auto w-full max-w-[1760px] px-3 py-10 sm:px-5 sm:py-16 lg:px-7">
      <div className="relative isolate overflow-hidden rounded-2xl sm:rounded-3xl bg-[#121316] text-ivory border border-white/10 shadow-2xl">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] items-center">
          
          {/* Left Column: Details & Call to Action */}
          <div className="p-6 sm:p-8 md:p-10 lg:py-12 lg:pl-12 lg:pr-6 max-w-xl">
            <p className="text-[0.72rem] sm:text-xs font-semibold uppercase tracking-[0.24em] text-gold">
              Vardagar {dagensLunch.time}
            </p>
            <h2
              id="lunch-title"
              className="mt-2 font-display text-2xl min-[440px]:text-3xl sm:text-4xl lg:text-5xl font-normal uppercase tracking-wide text-ivory"
            >
              Dagens Lunch
            </h2>
            <p className="mt-2.5 sm:mt-3 text-xs sm:text-sm lg:text-[0.95rem] text-ivory/75 leading-relaxed">
              Pizza, kebabtallrik, schnitzel, sallader och mer. Kaffe, bröd, smör, pizzasallad och dryck ingår.
            </p>
            <div className="mt-5 sm:mt-6 flex flex-wrap items-center gap-4 sm:gap-6">
              <Link
                href="/meny#lunch"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-gold/70 px-5 sm:px-6 py-2.5 text-xs sm:text-sm font-semibold text-gold transition-all duration-200 hover:bg-gold hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                <span>Se lunchmenyn</span>
                <ArrowIcon className="size-3.5" />
              </Link>

              {/* Price on narrow mobile screens (< sm) inline next to the button */}
              <div className="sm:hidden flex items-baseline">
                <span className="font-display text-3xl font-normal text-gold whitespace-nowrap">
                  {kr(dagensLunch.price)}
                </span>
              </div>
            </div>
          </div>

          {/* Middle Column: Vertical Divider & Price (shown on sm+ screens) */}
          <div className="hidden sm:flex items-center px-3 sm:px-5 lg:px-8 py-6 lg:py-12">
            <div className="h-16 lg:h-20 w-px bg-white/20 mr-4 sm:mr-6 lg:mr-8" aria-hidden="true" />
            <span className="font-display text-3xl min-[700px]:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-normal tracking-tight text-gold whitespace-nowrap">
              {kr(dagensLunch.price)}
            </span>
          </div>

          {/* Right Column: Fresh Salad Dish Image (kept visible on tablet/medium before disappearing on narrow mobile) */}
          <div className="hidden sm:block relative shrink-0 h-48 sm:h-56 md:h-64 lg:h-72 w-[160px] sm:w-[190px] md:w-[250px] lg:w-[320px] xl:w-[380px] overflow-hidden">
            <Image
              src="/images/dishes/lunch-salad.webp"
              alt="Fräsch sallad ingår i Dagens Lunch hos Falken"
              fill
              sizes="(min-width: 1280px) 380px, (min-width: 1024px) 320px, (min-width: 640px) 220px, 0px"
              className="object-cover object-left"
            />
            {/* Subtle soft blend into dark card */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#121316] via-[#121316]/30 to-transparent" />
          </div>

        </div>
      </div>
    </section>
  );
}
