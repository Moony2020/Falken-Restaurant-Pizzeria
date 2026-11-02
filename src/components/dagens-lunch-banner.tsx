import Image from "next/image";
import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { dagensLunch } from "@/data/site";
import { kr } from "@/lib/pricing";

export function DagensLunchBanner() {
  return (
    <section aria-labelledby="lunch-title" className="mx-auto w-full max-w-[1760px] px-3 py-10 sm:px-5 sm:py-16 lg:px-7">
      <div className="relative isolate overflow-hidden rounded-2xl sm:rounded-3xl bg-[#121316] text-ivory border border-white/10 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
          
          {/* Main Content & Call to Action */}
          <div className="p-6 sm:p-8 md:p-10 lg:py-12 lg:pl-12 lg:pr-8 flex-1 max-w-2xl">
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

              {/* Price on mobile / tablet (displayed inline next to the button) */}
              <div className="lg:hidden flex items-baseline">
                <span className="font-display text-3xl sm:text-4xl font-normal text-gold whitespace-nowrap">
                  {kr(dagensLunch.price)}
                </span>
              </div>
            </div>
          </div>

          {/* Desktop Divider & Price (shown on lg+ screens) */}
          <div className="hidden lg:flex items-center px-8 py-12">
            <div className="h-20 w-px bg-white/20 mr-8" aria-hidden="true" />
            <span className="font-display text-5xl xl:text-6xl font-normal tracking-tight text-gold whitespace-nowrap">
              {kr(dagensLunch.price)}
            </span>
          </div>

          {/* Right Column: Fresh Salad Dish Image (ONLY on large screens, completely REMOVED when page gets smaller) */}
          <div className="hidden lg:block relative shrink-0 h-64 lg:h-72 w-[280px] xl:w-[340px] overflow-hidden">
            <Image
              src="/images/dishes/lunch-salad.webp"
              alt="Fräsch sallad ingår i Dagens Lunch hos Falken"
              fill
              sizes="(min-width: 1024px) 340px, 0px"
              className="object-cover object-left"
            />
            {/* Subtle soft blend into dark card */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#121316] via-[#121316]/20 to-transparent" />
          </div>

        </div>
      </div>
    </section>
  );
}
