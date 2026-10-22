"use client";

import { useState } from "react";
import { PinIcon } from "@/components/icons";
import { mapsUrl, site } from "@/data/site";

/**
 * Map of the restaurant. Nothing is loaded from Google until the visitor asks for it, so opening the page sends no
 * data to a third party. The link below it always works without the embed.
 */
export function MapEmbed() {
  const [shown, setShown] = useState(false);
  const query = encodeURIComponent(
    `Restaurang & Pizzeria Falken, ${site.address.street}, ${site.address.zip} ${site.address.city}`,
  );

  return (
    <div className="relative aspect-[16/9] min-h-72 w-full overflow-hidden rounded-2xl border border-line bg-cream sm:aspect-[21/9]">
      {shown ? (
        <iframe
          title="Karta till Restaurang & Pizzeria Falken"
          src={`https://www.google.com/maps?q=${query}&hl=sv&z=15&output=embed`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="absolute inset-0 size-full border-0"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_30%_30%,#f3eedf,#e4dece)] p-6 text-center">
          <div className="max-w-sm">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-ink text-gold shadow-card">
              <PinIcon className="size-6" />
            </span>
            <p className="mt-4 font-display text-2xl font-semibold">
              {site.address.street}, {site.address.city}
            </p>
            <p className="mt-1 text-sm text-muted">
              Kartan hämtas från Google först när du trycker på knappen.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => setShown(true)}
                className="inline-flex min-h-11 items-center rounded-full bg-ink px-6 text-sm font-semibold text-ivory transition hover:bg-ink-3"
              >
                Visa karta
              </button>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-full border border-ink/25 px-6 text-sm font-semibold transition hover:bg-ink hover:text-ivory"
              >
                Öppna i Google Maps
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
