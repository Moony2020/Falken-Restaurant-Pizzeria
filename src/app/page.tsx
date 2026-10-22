import Image from "next/image";
import Link from "next/link";
import { ArrowIcon, ClockIcon, MailIcon, PhoneIcon, PinIcon } from "@/components/icons";
import { DishArt } from "@/components/art";
import { HeroPizza } from "@/components/hero-pizza";
import { OpenStatus } from "@/components/open-status";
import { FeaturedDishes } from "@/components/featured-dishes";
import { buttonClass, eyebrow } from "@/components/ui";
import { categories, type CategoryId } from "@/data/menu";
import { CURRENT_SEASON, dagensLunch, heroImage, hoursDisplay, mapsUrl, site } from "@/data/site";
import { kr } from "@/lib/pricing";

const tiles: CategoryId[] = ["pizza", "kebabpizza", "kebab", "hamburgare", "sallader", "alacarte", "barn", "lunch"];

const steps = [
  { title: "Välj din rätt", text: "Bläddra bland pizzor, kebab, grillat och sallader." },
  { title: "Anpassa", text: "Välj storlek, ta bort ingredienser och lämna önskemål till köket." },
  { title: "Välj hämtningstid", text: "Hämta när det passar dig medan maten är nylagad." },
  { title: "Hämta och njut", text: "Kom förbi Skolgatan 4 i Vintrosa – vi har det klart." },
];

export default function HomePage() {
  return (
    <>
      <section aria-labelledby="hero-title" className="bg-[linear-gradient(to_bottom,var(--color-ink-2)_0,var(--color-ink-2)_88%,var(--color-ivory)_88%)]">
        <div className="mx-auto w-full max-w-[1760px] px-3 pb-2 pt-2 sm:px-5 sm:pt-3 lg:px-7">
          <div className="hero-slate relative isolate grid items-center overflow-hidden rounded-[1.5rem] px-7 pt-10 shadow-[0_24px_50px_-24px_rgb(0_0_0/0.6)] ring-1 ring-white/5 sm:px-12 lg:min-h-[22rem] lg:grid-cols-[1.15fr_1fr] lg:px-12 lg:py-10 xl:min-h-[25rem] xl:px-16 xl:py-12">
            <div className="relative z-10 max-w-xl animate-rise lg:max-w-none">
              <OpenStatus />
              <h1 id="hero-title" className="mt-4 text-[2.5rem] font-medium uppercase leading-[1.05] text-ivory sm:text-5xl lg:text-[2.8rem] xl:text-[3.6rem]">
                Äkta smak i
                <span className="block text-gold">hjärtat av Vintrosa</span>
              </h1>
              <p className="mt-4 max-w-md text-base leading-relaxed text-ivory/80">
                Över 90 rätter – pizza, kebab, hamburgare och à la carte. Beställ för avhämtning eller slå dig ner hos oss.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/meny" className={buttonClass("gold")}>
                  Se menyn
                </Link>
                <Link href="/kontakt" className={buttonClass("outline-light")}>
                  Hitta hit
                </Link>
              </div>
            </div>

            <div
              aria-hidden="true"
              className="pointer-events-none relative -mb-24 mt-8 flex justify-center sm:-mb-32 lg:absolute lg:-right-10 lg:top-1/2 lg:mb-0 lg:mt-0 lg:block lg:size-[26rem] lg:-translate-y-1/2 xl:-right-12 xl:size-[34rem]"
            >
              {heroImage ? (
                <Image src={heroImage} alt="" fill priority sizes="(min-width: 1024px) 464px, 100vw" className="object-cover object-center" />
              ) : (
                <HeroPizza className="size-72 sm:size-96 lg:size-full" />
              )}
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="featured-title" className="wrap py-16 sm:py-20">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className={eyebrow}>Från köket</p>
            <h2 id="featured-title" className="mt-1 text-4xl font-medium uppercase sm:text-5xl">
              Utvalda rätter
            </h2>
          </div>
          <Link href="/meny" className="hidden items-center gap-2 text-sm font-semibold text-gold-deep underline-offset-4 hover:underline sm:inline-flex">
            Hela menyn <ArrowIcon className="size-4" />
          </Link>
        </div>
        <FeaturedDishes />
      </section>

      <section aria-labelledby="categories-title" className="bg-cream py-16 sm:py-20">
        <div className="wrap">
          <p className={eyebrow}>Menyn</p>
          <h2 id="categories-title" className="mt-1 text-4xl font-medium uppercase sm:text-5xl">
            Vad är du sugen på?
          </h2>
          <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            {tiles.map((id) => {
              const c = categories.find((x) => x.id === id)!;
              return (
                <li key={id}>
                  <Link
                    href={`/meny#${id}`}
                    className="group relative block overflow-hidden rounded-2xl bg-ink text-ivory shadow-card"
                  >
                    <DishArt category={id} seed={id.length + 2} className="aspect-[4/3] w-full transition duration-500 group-hover:scale-105" />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink via-ink/85 to-transparent p-4 pt-10">
                      <p className="font-display text-xl font-semibold">{c.name}</p>
                      <p className="text-xs text-gold">Se rätterna</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section aria-labelledby="lunch-title" className="wrap py-16 sm:py-20">
        <div className="grid items-center gap-8 overflow-hidden rounded-[1.75rem] bg-ink px-7 py-10 text-ivory sm:px-12 md:grid-cols-[1fr_auto]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold">Vardagar {dagensLunch.time}</p>
            <h2 id="lunch-title" className="mt-2 text-4xl font-medium uppercase sm:text-5xl">
              Dagens lunch
            </h2>
            <p className="mt-3 max-w-xl text-[0.95rem] leading-relaxed text-ivory/75">
              Pizza, kebabtallrik, schnitzel, sallader och mer. {dagensLunch.includes}
            </p>
            <Link href="/meny#lunch" className={`${buttonClass("outline-light")} mt-6`}>
              Se lunchmenyn
            </Link>
          </div>
          <p className="font-display text-7xl font-semibold tabular-nums text-gold sm:text-8xl">{kr(dagensLunch.price)}</p>
        </div>
      </section>

      <section aria-labelledby="how-title" className="bg-cream py-16 sm:py-20">
        <div className="wrap">
          <p className={eyebrow}>Beställ för avhämtning</p>
          <h2 id="how-title" className="mt-1 text-4xl font-medium uppercase sm:text-5xl">
            Så enkelt är det
          </h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title} className="relative rounded-2xl border border-line bg-white p-6">
                <span className="font-display text-5xl font-medium text-gold">{i + 1}</span>
                <h3 className="mt-2 text-2xl font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="visit-title" className="wrap py-16 sm:py-20">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-white p-8 shadow-card">
            <p className={eyebrow}>Välkommen in</p>
            <h2 id="visit-title" className="mt-1 text-4xl font-medium uppercase">
              Hitta hit
            </h2>
            <address className="mt-6 space-y-4 not-italic">
              <p className="flex gap-3">
                <PinIcon className="mt-0.5 size-5 shrink-0 text-gold-deep" />
                <span>
                  {site.legalName}
                  <br />
                  {site.address.street}, {site.address.zip} {site.address.city}
                </span>
              </p>
              <a href={site.phoneHref} className="flex items-center gap-3 hover:text-gold-deep">
                <PhoneIcon className="size-5 shrink-0 text-gold-deep" />
                {site.phone}
              </a>
              <a href={`mailto:${site.email}`} className="flex items-center gap-3 break-all hover:text-gold-deep">
                <MailIcon className="size-5 shrink-0 text-gold-deep" />
                {site.email}
              </a>
            </address>
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={`${buttonClass("ink")} mt-8`}>
              Visa på kartan
            </a>
          </div>

          <div className="rounded-2xl border border-line bg-white p-8 shadow-card">
            <p className={eyebrow}>Öppettider</p>
            <h2 className="mt-1 text-4xl font-medium uppercase">Vi har öppet</h2>
            <dl className="mt-6 divide-y divide-line">
              {hoursDisplay[CURRENT_SEASON].map((row) => (
                <div key={row.days} className="flex justify-between gap-4 py-3 text-[0.95rem]">
                  <dt className="font-medium">{row.days}</dt>
                  <dd className="tabular-nums text-muted">{row.time}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm">
                <ClockIcon className="size-5 text-gold-deep" />
                <OpenStatus tone="light" />
              </span>
              <Link href="/kontakt#oppettider" className="text-sm font-semibold text-gold-deep underline underline-offset-4">
                Sommartider
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
