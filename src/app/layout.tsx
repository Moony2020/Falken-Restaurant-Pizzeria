import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { Suspense } from "react";
import { OrderProvider } from "@/components/order/order-provider";
import { SiteShell } from "@/components/site-shell";
import { site } from "@/data/site";
import "./globals.css";

const display = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sans = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "Falken – Restaurang & Pizzeria i Vintrosa",
    template: "%s | Falken Vintrosa",
  },
  description:
    "Pizza, kebab, hamburgare och à la carte i Vintrosa. Se menyn och beställ för avhämtning hos Restaurang & Pizzeria Falken.",
  openGraph: {
    type: "website",
    locale: "sv_SE",
    siteName: site.legalName,
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#14161a",
};

const restaurantJsonLd = {
  "@context": "https://schema.org",
  "@type": "Restaurant",
  name: site.legalName,
  url: site.url,
  telephone: "+4619294898",
  email: site.email,
  servesCuisine: ["Pizza", "Kebab", "Grill"],
  address: {
    "@type": "PostalAddress",
    streetAddress: site.address.street,
    postalCode: site.address.zip,
    addressLocality: site.address.city,
    addressCountry: "SE",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sv" suppressHydrationWarning data-scroll-behavior="smooth" className={`${display.variable} ${sans.variable}`}>
      <body suppressHydrationWarning className="flex min-h-dvh flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(restaurantJsonLd).replace(/</g, "\\u003c") }}
        />
        <OrderProvider>
          <Suspense fallback={<main id="innehall" className="flex-1">{children}</main>}>
            <SiteShell>{children}</SiteShell>
          </Suspense>
        </OrderProvider>
      </body>
    </html>
  );
}
