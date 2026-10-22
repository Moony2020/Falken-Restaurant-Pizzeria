import Image from "next/image";
import { HeroPizza } from "@/components/hero-pizza";

/**
 * Background of the dark page banners: a warm glow like a wood-fired oven, fine rings, and one whole pizza on a plate
 * at the right. Still an illustration: pass `image` (a path under /public, set in data/site.ts) to show a real photo.
 */
export function BannerArt({ image }: { image?: string | null }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_90%_at_82%_50%,rgb(184_112_38/0.38),transparent_70%),radial-gradient(ellipse_40%_60%_at_100%_100%,rgb(150_40_20/0.35),transparent_70%)]" />
      <svg
        className="absolute right-[-6rem] top-1/2 hidden h-[44rem] w-[44rem] -translate-y-1/2 text-gold/20 lg:block"
        viewBox="0 0 400 400"
        fill="none"
      >
        {[190, 160, 130].map((r) => (
          <circle
            key={r}
            cx="200"
            cy="200"
            r={r}
            stroke="currentColor"
            strokeWidth="1"
          />
        ))}
      </svg>
      <div className="absolute right-[6%] top-1/2 hidden size-[20rem] -translate-y-1/2 rotate-[14deg] drop-shadow-[0_30px_40px_rgba(0,0,0,0.55)] lg:block xl:right-[9%] xl:size-[22rem]">
        {image ? (
          <Image
            src={image}
            alt=""
            fill
            sizes="352px"
            className="rounded-full object-cover"
          />
        ) : (
          <HeroPizza className="size-full" />
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-ink-2 from-35% via-ink-2/30 to-transparent lg:from-45%" />
    </div>
  );
}
