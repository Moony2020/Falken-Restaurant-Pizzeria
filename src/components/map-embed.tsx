"use client";

import { useRestaurantSettings } from "@/lib/use-restaurant-settings";

/**
 * Google map of the restaurant, shown straight away (lazy-loaded when it scrolls into view) with a small address card
 * on top like the reference design. The link under the map works without the embed.
 */
export function MapEmbed() {
  const { settings } = useRestaurantSettings();
  const query = encodeURIComponent(`${settings.legalName || settings.name || "Restaurang & Pizzeria Falken"}, ${settings.address.street}, ${settings.address.zip} ${settings.address.city}`);

  return (
    <div className="relative aspect-[4/3] min-h-80 w-full overflow-hidden rounded-2xl border border-line bg-cream shadow-card sm:aspect-[21/9]">
      <iframe
        title={`Karta till ${settings.legalName || settings.name}`}
        src={`https://www.google.com/maps?q=${query}&hl=sv&z=15&output=embed`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="absolute inset-0 size-full border-0"
      />
    </div>
  );
}
