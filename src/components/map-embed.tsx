import { PinIcon } from "@/components/icons";
import { mapsUrl, site } from "@/data/site";

/**
 * Google map of the restaurant, shown straight away (lazy-loaded when it scrolls into view) with a small address card
 * on top like the reference design. The link under the map works without the embed.
 */
export function MapEmbed() {
  const query = encodeURIComponent(`Restaurang & Pizzeria Falken, ${site.address.street}, ${site.address.zip} ${site.address.city}`);

  return (
    <div className="relative aspect-[4/3] min-h-80 w-full overflow-hidden rounded-2xl border border-line bg-cream shadow-card sm:aspect-[21/9]">
      <iframe
        title="Karta till Restaurang & Pizzeria Falken"
        src={`https://www.google.com/maps?q=${query}&hl=sv&z=15&output=embed`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="absolute inset-0 size-full border-0"
      />
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-4 left-4 flex max-w-[calc(100%-2rem)] items-center gap-3 rounded-xl bg-ink px-4 py-3 text-ivory shadow-2xl transition hover:bg-ink-3"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold/15 text-gold">
          <PinIcon className="size-5" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block text-xs font-semibold uppercase tracking-[0.14em]">Pizzeria Falken</span>
          <span className="block text-sm text-ivory/80">
            {site.address.street}, {site.address.zip} {site.address.city}
          </span>
        </span>
      </a>
    </div>
  );
}
