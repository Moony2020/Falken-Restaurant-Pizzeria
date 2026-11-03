import type { Metadata } from "next";
import Link from "next/link";
import { GalleryHero } from "@/components/gallery-hero";
import { GalleryGrid } from "@/components/gallery-grid";
import { buttonClass } from "@/components/ui";
import { PREP_MINUTES, site } from "@/data/site";

export const metadata: Metadata = {
  title: "Galleri",
  description:
    "Se maten och miljön hos Restaurang & Pizzeria Falken i Vintrosa.",
  alternates: { canonical: "/galleri" },
};

const facts = [
  {
    title: "Över 100 rätter",
    text: "Pizza, kebab, hamburgare, sallader och à la carte – något för alla i familjen.",
    href: "/meny",
    link: "Se hela menyn",
  },
  {
    title: "Snabbt & smidigt",
    text: `Beställ online och välj hämtningstid. Klart efter ca ${PREP_MINUTES} minuter.`,
    href: "/meny",
    link: "Beställ online",
  },
  {
    title: "Glutenfri deg",
    text: "Pizza på glutenfri deg mot ett tillägg på 30 kr. Har du allergi – ring oss först.",
    href: "/kontakt",
    link: "Kontakta oss",
  },
];

export default function GalleriPage() {
  return (
    <>
      <GalleryHero />
      <div className="wrap py-12 sm:py-16">
        <GalleryGrid />

        <ul className="mt-14 grid gap-4 md:grid-cols-3">
          {facts.map((f, idx) => (
            <li
              key={f.title}
              className="rounded-2xl border border-line bg-white p-6 shadow-card" data-reveal="fade-up" data-delay={(idx * 100).toString()}
            >
              <h2 className="font-display text-xl font-semibold uppercase tracking-wide">
                {f.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {f.text}
              </p>
              <Link
                href={f.href}
                className="mt-4 inline-block text-xs font-semibold uppercase tracking-[0.14em] text-gold-deep underline underline-offset-4"
              >
                {f.link}
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-10 overflow-hidden rounded-3xl bg-ink px-6 py-12 text-ivory sm:px-12" data-reveal="fade-up">
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold">
                Matglädje i Vintrosa
              </p>
              <h2 className="mt-2 text-2xl font-medium uppercase min-[440px]:text-3xl sm:text-5xl">
                Blev du sugen på något gott?
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ivory/75">
                Beställ för avhämtning och hämta det nylagat hos oss på{" "}
                {site.address.street} – klart efter ca {PREP_MINUTES} minuter.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/meny" className={buttonClass("gold")}>
                Beställ för avhämtning
              </Link>
              <Link
                href="/kontakt#oppettider"
                className={buttonClass("outline-light")}
              >
                Se öppettider
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
