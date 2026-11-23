"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  galleryHeroImage,
  heroImage,
  LAST_PICKUP_BEFORE_CLOSE,
  mapsUrl,
  menuHeroImage,
  PREP_MINUTES,
  site,
} from "@/data/site";

export type PublicRestaurantSettings = {
  name: string;
  legalName: string;
  tagline: string;
  phone: string;
  phoneHref: string;
  email: string;
  address: {
    street: string;
    zip: string;
    city: string;
    country: string;
  };
  mapsUrl: string;
  social: {
    facebook: string;
    instagram: string;
  };
  heroImage: string;
  menuHeroImage: string;
  contactHeroImage: string;
  galleryHeroImage: string;
  prepMinutes: number;
  lastPickupBeforeClose: number;
  revision: number;
  updatedAt: string | null;
};

export function derivePhoneHref(phone: string): string {
  const digitsOnly = phone.replace(/[\s\-_().]/g, "");
  if (!digitsOnly) return "tel:+4619294898";
  if (digitsOnly.startsWith("+")) {
    return `tel:${digitsOnly}`;
  }
  if (digitsOnly.startsWith("00")) {
    return `tel:+${digitsOnly.slice(2)}`;
  }
  if (digitsOnly.startsWith("0")) {
    return `tel:+46${digitsOnly.slice(1)}`;
  }
  return `tel:+46${digitsOnly}`;
}

export const DEFAULT_PUBLIC_SETTINGS: PublicRestaurantSettings = {
  name: site.name,
  legalName: site.legalName,
  tagline: site.tagline,
  phone: site.phone,
  phoneHref: site.phoneHref,
  email: site.email,
  address: {
    street: site.address.street,
    zip: site.address.zip,
    city: site.address.city,
    country: site.address.country,
  },
  mapsUrl,
  social: {
    facebook: site.social.facebook,
    instagram: site.social.instagram,
  },
  heroImage: heroImage || "/images/hero/menuhero.webp",
  menuHeroImage: menuHeroImage || "/images/hero/Hero-image.webp",
  contactHeroImage: "/images/gallery/restaurant1.webp",
  galleryHeroImage: galleryHeroImage || "/images/gallery/gallery-hero.webp",
  prepMinutes: PREP_MINUTES,
  lastPickupBeforeClose: LAST_PICKUP_BEFORE_CLOSE,
  revision: 0,
  updatedAt: null,
};

let currentCachedSettings: PublicRestaurantSettings = DEFAULT_PUBLIC_SETTINGS;
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): PublicRestaurantSettings {
  return currentCachedSettings;
}

function getServerSnapshot(): PublicRestaurantSettings {
  return DEFAULT_PUBLIC_SETTINGS;
}

export function notifySettingsChange(newSettings?: PublicRestaurantSettings) {
  if (newSettings) {
    currentCachedSettings = newSettings;
  }
  listeners.forEach((listener) => listener());
}

export function useRestaurantSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/restaurant/settings", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as PublicRestaurantSettings;
        if (active && data && typeof data === "object") {
          currentCachedSettings = data;
          notifySettingsChange(data);
          setLoaded(true);
        }
      } catch {
        // Fallback remains active
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  return { settings, loaded, reload: notifySettingsChange };
}
