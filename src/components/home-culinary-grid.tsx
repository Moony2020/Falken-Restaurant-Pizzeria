import Image from "next/image";
import Link from "next/link";
import { ArrowIcon, FacebookIcon, InstagramIcon } from "@/components/icons";
import { site } from "@/data/site";

const moments = [
  {
    image: "/images/dishes/alacarte/falken-oxfile-planka.webp",
    tag: "Klassisk À la carte",
    title: "Oxfilé på planka",
    subtitle: "Hemlagad bearnaise & spritsat duchessemos",
  },
  {
    image: "/images/gallery/restaurant1.webp",
    tag: "Restaurangmiljö",
    title: "Välkommen till bords",
    subtitle: "Varm och ombonad matsal på Skolgatan 4",
  },
  {
    image: "/images/dishes/falken-lunch-salad.webp",
    tag: "Dagens Lunch",
    title: "Fräscht från grunden",
    subtitle: "Pizzasallad, hembakat bröd och salladsbuffé",
  },
  {
    image: "/images/hero/Hero-image.webp",
    tag: "Stenugnsbakat",
    title: "Äkta hantverkspizza",
    subtitle: "Krispig botten med noggrant utvalda råvaror",
  },
];

export function HomeCulinaryGrid() {
  return (
    <section aria-labelledby="culinary-title" className="bg-white py-14 sm:py-20 border-b border-[#ede6da]">
      <div className="mx-auto w-full max-w-[1760px] px-3 sm:px-5 lg:px-7">
        
        {/* Editorial Header & Social Follow */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10 sm:mb-12">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold-deep">
              Matglädje & gemenskap
            </p>
            <h2
              id="culinary-title"
              className="mt-1.5 font-display text-2xl sm:text-4xl md:text-5xl font-normal uppercase tracking-wide text-ink"
            >
              Hantverk i <span className="text-gold-deep italic lowercase font-serif tracking-normal">varje</span> detalj
            </h2>
            <p className="mt-2.5 text-xs sm:text-sm text-muted leading-relaxed">
              Följ oss på Facebook och Instagram för veckans luncher, nyheter från köket och stämningsbilder.
            </p>
          </div>

          {/* Social Follow Badges */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <a
              href={site.social.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-semibold text-ink transition-all duration-200 hover:bg-gold hover:border-gold hover:shadow-sm"
            >
              <InstagramIcon className="size-4 text-gold-deep" />
              <span>@falkenvintrosa</span>
            </a>
            <a
              href={site.social.facebook}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-[#ede6da] bg-[#fbf9f5] px-4 py-2 text-xs font-semibold text-ink transition-all duration-200 hover:border-gold hover:bg-white hover:shadow-sm"
            >
              <FacebookIcon className="size-4 text-gold-deep" />
              <span>Facebook</span>
            </a>
          </div>
        </div>

        {/* 4-Item Visual Photography Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {moments.map((item, idx) => (
            <Link
              key={idx}
              href="/galleri"
              className="group relative overflow-hidden rounded-2xl border border-[#ede6da] bg-[#1a1d22] aspect-[4/5] shadow-sm transition-all duration-300 hover:shadow-lg hover:border-gold/50"
            >
              <Image
                src={item.image}
                alt={item.title}
                fill
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                className="object-cover object-center transition-transform duration-700 group-hover:scale-105"
              />

              {/* Gradient overlay for readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent transition-opacity duration-300 group-hover:opacity-95" />

              {/* Top Tag */}
              <div className="absolute top-3.5 left-3.5 z-10">
                <span className="inline-flex items-center rounded-full bg-black/60 backdrop-blur-md px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-gold border border-gold/30">
                  {item.tag}
                </span>
              </div>

              {/* Bottom Caption & Arrow */}
              <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 z-10 text-ivory">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <h3 className="font-display text-base sm:text-lg font-medium text-ivory group-hover:text-gold transition-colors">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-[0.72rem] sm:text-xs text-ivory/80 line-clamp-1">
                      {item.subtitle}
                    </p>
                  </div>
                  <div className="size-8 rounded-full border border-white/20 bg-white/10 backdrop-blur-md flex items-center justify-center text-ivory shrink-0 transition-transform duration-300 group-hover:translate-x-1 group-hover:bg-gold group-hover:text-ink group-hover:border-gold">
                    <ArrowIcon className="size-3.5" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

      </div>
    </section>
  );
}
