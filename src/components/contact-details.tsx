"use client";

import Link from "next/link";
import { MailIcon, PhoneIcon, PinIcon } from "@/components/icons";
import { buttonClass, eyebrow } from "@/components/ui";
import { useRestaurantSettings } from "@/lib/use-restaurant-settings";

export function ContactInfoCards() {
  const { settings } = useRestaurantSettings();

  const contacts = [
    {
      icon: PinIcon,
      label: "Adress",
      value: `${settings.address.street}, ${settings.address.zip} ${settings.address.city}`,
      href: settings.mapsUrl,
      external: true,
    },
    {
      icon: PhoneIcon,
      label: "Telefon",
      value: settings.phone,
      href: settings.phoneHref,
      external: false,
    },
    {
      icon: MailIcon,
      label: "E-post",
      value: settings.email,
      href: `mailto:${settings.email}`,
      external: false,
    },
  ];

  return (
    <section aria-labelledby="contact-title">
      <p className={eyebrow}>Hitta oss</p>
      <h2
        id="contact-title"
        className="mt-1 text-2xl font-medium uppercase min-[440px]:text-3xl sm:text-5xl"
      >
        {settings.legalName}
      </h2>
      <ul className="mt-8 space-y-3">
        {contacts.map(({ icon: Icon, label, value, href, external }, idx) => (
          <li key={label}>
            <a
              href={href}
              {...(external
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
              className="group flex items-center gap-4 rounded-2xl border border-line bg-white p-4 shadow-card transition hover:border-gold"
              data-reveal="fade-up"
              data-delay={(idx * 100).toString()}
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-cream text-gold-deep transition group-hover:bg-gold group-hover:text-ink">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs uppercase tracking-[0.18em] text-muted">
                  {label}
                </span>
                <span className="block break-words font-medium">
                  {value}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-wrap gap-3">
        <a
          href={settings.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass("ink")}
        >
          Vägbeskrivning
        </a>
        <Link href="/meny" className={buttonClass("gold")}>
          Beställ online
        </Link>
      </div>
    </section>
  );
}

export function ContactPickupCard() {
  const { settings } = useRestaurantSettings();

  return (
    <div className="flex gap-4 rounded-2xl border border-line bg-white p-6 shadow-card">
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-cream text-gold-deep">
        <PhoneIcon className="size-5" />
      </span>
      <div>
        <h2 className="font-display text-2xl font-semibold">
          Avhämtning
        </h2>
        <p className="mt-1 text-sm text-muted">
          Klart efter ca {settings.prepMinutes} minuter. Beställ online och välj
          hämtningstid, eller ring oss på{" "}
          <a href={settings.phoneHref} className="text-gold-deep underline underline-offset-2 hover:text-ink">
            {settings.phone}
          </a>
          .
        </p>
        <Link
          href="/meny"
          className="mt-3 inline-block text-sm font-semibold text-gold-deep underline underline-offset-4"
        >
          Beställ online
        </Link>
      </div>
    </div>
  );
}

export function ContactMapHeader() {
  const { settings } = useRestaurantSettings();

  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className={eyebrow}>Karta &amp; besök</p>
        <h2
          id="map-title"
          className="mt-1 text-2xl font-medium uppercase min-[440px]:text-3xl sm:text-5xl"
        >
          Hitta till {settings.name}
        </h2>
      </div>
      <a
        href={settings.mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass("ink")}
      >
        Få vägbeskrivning
      </a>
    </div>
  );
}

export function ContactMapAddress() {
  const { settings } = useRestaurantSettings();

  return (
    <p className="mt-4 text-sm text-muted">
      {settings.address.street}, {settings.address.zip} {settings.address.city}
    </p>
  );
}
