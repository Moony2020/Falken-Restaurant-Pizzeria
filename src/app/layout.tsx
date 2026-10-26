import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { Suspense } from "react";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { CartDrawer } from "@/components/order/cart-drawer";
import { OrderProvider } from "@/components/order/order-provider";
import { ProductDialog } from "@/components/order/product-dialog";
import { Toast } from "@/components/order/toast";
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
          <a
            href="#innehall"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-gold focus:px-5 focus:py-3 focus:text-sm focus:font-semibold focus:text-ink"
          >
            Hoppa till innehållet
          </a>
          {/* The header reads the current path, which a page with a dynamic order number only knows at request time. */}
          <Suspense fallback={<div className="h-20 bg-ink-2 sm:h-24" aria-hidden="true" />}>
            <Header />
          </Suspense>
          <main id="innehall" className="flex-1">
            {children}
          </main>
          <Footer />
          <ProductDialog />
          <CartDrawer />
          <Toast />
        </OrderProvider>
      </body>
    </html>
  );
}
