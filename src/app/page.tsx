import Link from "next/link";
import Image from "next/image";
import {
  ArrowIcon,
  StepPizzaIcon,
  StepCustomizeIcon,
  StepCalendarIcon,
  StepBagIcon,
} from "@/components/icons";
import { OpenStatus } from "@/components/open-status";
import { FeaturedDishes } from "@/components/featured-dishes";
import { HomeWelcome } from "@/components/home-welcome";
import { DagensLunchBanner } from "@/components/dagens-lunch-banner";
import { HomeCulinaryGrid } from "@/components/home-culinary-grid";
import { HomeReviews } from "@/components/home-reviews";
import { HomeVisit } from "@/components/home-visit";
import { buttonClass, eyebrow } from "@/components/ui";

const steps = [
  {
    title: "1. Välj din rätt",
    text: "Bläddra bland pizzor, kebab, grillat och sallader.",
    Icon: StepPizzaIcon,
  },
  {
    title: "2. Anpassa",
    text: "Välj storlek, ta bort ingredienser och lämna önskemål till köket.",
    Icon: StepCustomizeIcon,
  },
  {
    title: "3. Välj hämtningstid",
    text: "Hämta när det passar dig medan maten är nylagad.",
    Icon: StepCalendarIcon,
  },
  {
    title: "4. Hämta och njut",
    text: "Kom förbi Skolgatan 4 i Vintrosa – vi har det klart.",
    Icon: StepBagIcon,
  },
];

export default function HomePage() {
  return (
    <>
      <section aria-labelledby="hero-title" className="bg-[linear-gradient(to_bottom,var(--color-ink-2)_0,var(--color-ink-2)_70%,var(--color-ivory)_70%)]">
        <div className="mx-auto w-full max-w-[1760px] px-3 pb-2 pt-2 sm:px-5 sm:pt-3 lg:px-7">
          <div className="relative isolate flex min-h-[23.5rem] items-center overflow-hidden rounded-[1.5rem] bg-[#1a1d22] px-5 py-6 shadow-[0_24px_50px_-24px_rgb(0_0_0/0.7)] ring-1 ring-white/10 sm:min-h-[25.5rem] sm:px-12 sm:py-10 lg:min-h-[27rem] lg:px-14 xl:min-h-[29rem] xl:px-16">
            
            {/* Background hero photo with pizza perfectly on the right and warm restaurant wood on the left */}
            <div className="pointer-events-none absolute inset-0 z-0 select-none overflow-hidden">
              <Image
                src="/images/hero/Hero-image.webp"
                alt="Restaurang & Pizzeria Falken"
                fill
                priority
                quality={92}
                sizes="(min-width: 1760px) 1760px, 100vw"
                className="object-cover object-[78%_center] sm:object-[74%_center] lg:object-[68%_center] xl:object-[62%_center]"
              />

              {/* Soft, warm dark shadow on the left behind text allowing natural wood & warm lights to shine through */}
              <div className="hidden md:block absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 via-42% to-transparent" />
              
              {/* Mobile overlay */}
              <div className="md:hidden absolute inset-0 bg-gradient-to-t from-black/60 via-black/40 to-black/20" />
            </div>

            {/* Left Content (2 lines title, comfortable spacing, original elegant typography) */}
            <div className="relative z-10 max-w-xl animate-rise lg:max-w-2xl">
              <OpenStatus />
              <h1 id="hero-title" className="mt-2.5 font-display text-[1.85rem] font-medium uppercase leading-[1.08] text-ivory drop-shadow-md sm:mt-3 sm:text-4xl lg:text-[2.6rem] xl:text-[3.2rem]">
                Äkta smak i
                <span className="block text-gold">hjärtat av Vintrosa</span>
              </h1>
              <p className="mt-2 max-w-md text-xs leading-relaxed text-ivory/90 drop-shadow-sm sm:mt-3.5 sm:text-base">
                Över 90 rätter – pizza, kebab, hamburgare och à la carte. Beställ för avhämtning eller slå dig ner hos oss.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2.5 sm:mt-6 sm:gap-3">
                <Link href="/meny" className={buttonClass("gold")}>
                  Se menyn
                </Link>
                <Link href="/meny" className={buttonClass("outline-light")}>
                  Beställ online
                </Link>
              </div>
            </div>

          </div>
        </div>
      </section>

      <section aria-labelledby="featured-title" className="mx-auto w-full max-w-[1760px] px-3 pb-16 pt-10 sm:px-5 sm:pb-20 sm:pt-12 lg:px-7 lg:pt-14">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className={eyebrow}>Från köket</p>
            <h2 id="featured-title" className="mt-1 text-2xl font-medium uppercase min-[440px]:text-3xl sm:text-5xl">
              Utvalda rätter
            </h2>
          </div>
          <Link href="/meny" className="hidden items-center gap-2 text-sm font-semibold text-gold-deep underline-offset-4 hover:underline sm:inline-flex">
            Hela menyn <ArrowIcon className="size-4" />
          </Link>
        </div>
        <FeaturedDishes />
      </section>

      <HomeWelcome />

      <DagensLunchBanner />

      <HomeCulinaryGrid />

      <HomeReviews />

      {/* Så enkelt är det & Besök oss (Unified warm cream section with reduced spacing & elegant divider line) */}
      <section className="bg-[#fbf9f5] border-t border-[#ede6da] pt-12 pb-16 sm:pt-16 sm:pb-20">
        <div className="wrap">
          
          {/* Så enkelt är det */}
          <div aria-labelledby="how-title">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold-deep">Beställ för avhämtning</p>
            <h2 id="how-title" className="mt-1 font-display text-2xl font-normal uppercase min-[440px]:text-3xl sm:text-5xl tracking-wide text-ink">
              Så enkelt är det
            </h2>
            <ol className="mt-6 sm:mt-8 grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s) => (
                <li
                  key={s.title}
                  className="relative rounded-2xl sm:rounded-3xl border border-[#ede6da] bg-white p-6 sm:p-7 shadow-sm transition-all duration-300 hover:shadow-md"
                >
                  <div className="flex items-center justify-start">
                    <s.Icon className="size-8 sm:size-9 text-gold-deep" />
                  </div>
                  <h3 className="mt-4 font-display text-xl sm:text-2xl font-medium text-ink">{s.title}</h3>
                  <p className="mt-2 text-xs sm:text-sm leading-relaxed text-muted">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>

          {/* Elegant Divider Line between sections (reduces dead space & creates cohesive flow) */}
          <div className="my-10 sm:my-14 h-px w-full bg-[#ede6da]" aria-hidden="true" />

          {/* Hitta hit & Öppettider (Luxury Redesigned Experience) */}
          <HomeVisit />

        </div>
      </section>
    </>
  );
}
