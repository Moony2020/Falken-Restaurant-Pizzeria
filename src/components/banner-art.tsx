import Image from "next/image";

/**
 * Background of the dark page banners: a warm glow like a wood-fired oven, fine rings, and one whole pizza on a plate
 * at the right. Still an illustration: pass `image` (a path under /public, set in data/site.ts) to show a real photo.
 */
export function BannerArt({ image }: { image?: string | null }) {
  const photoSrc = image || "/images/hero/pizza-circle.jpg";

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_90%_at_82%_50%,rgb(184_112_38/0.38),transparent_70%),radial-gradient(ellipse_40%_60%_at_100%_100%,rgb(150_40_20/0.35),transparent_70%)]" />
      <div className="absolute right-[2%] top-1/2 hidden size-[17rem] -translate-y-1/2 drop-shadow-[0_30px_50px_rgba(0,0,0,0.65)] min-[900px]:block min-[900px]:size-[19rem] lg:size-[24rem] xl:right-[7%] xl:size-[26rem] 2xl:size-[28rem]">
        <div className="relative size-full overflow-hidden rounded-full ring-2 ring-gold/45 shadow-[0_24px_55px_rgba(0,0,0,0.7)]">
          <Image
            src={photoSrc}
            alt=""
            fill
            priority
            sizes="(min-width: 1536px) 448px, (min-width: 1280px) 416px, (min-width: 900px) 304px, 384px"
            className="object-cover"
          />
        </div>
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-ink-2 from-35% via-ink-2/30 to-transparent min-[900px]:from-45%" />
    </div>
  );
}
