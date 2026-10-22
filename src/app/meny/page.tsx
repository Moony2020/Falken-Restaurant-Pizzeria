import type { Metadata } from "next";
import { MenuBrowser } from "@/components/order/menu-browser";

export const metadata: Metadata = {
  title: "Meny & Beställ",
  description:
    "Pizza, kebabpizza, kebab, hamburgare, sallader och à la carte hos Falken i Vintrosa. Välj, anpassa och beställ för avhämtning.",
  alternates: { canonical: "/meny" },
};

// The banner is rendered by MenuBrowser because the search field lives in it.
export default function MenyPage() {
  return <MenuBrowser />;
}
