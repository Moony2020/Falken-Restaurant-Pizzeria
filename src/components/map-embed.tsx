import { site } from "@/data/site";

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
    </div>
  );
}
