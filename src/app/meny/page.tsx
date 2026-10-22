import type { Metadata } from "next";
import { MenuBrowser } from "@/components/order/menu-browser";
import { PageBanner } from "@/components/page-banner";

export const metadata: Metadata = {
  title: "Meny & Beställ",
  description:
    "Pizza, kebabpizza, kebab, hamburgare, sallader och à la carte hos Falken i Vintrosa. Välj, anpassa och beställ för avhämtning.",
  alternates: { canonical: "/meny" },
};

export default function MenyPage() {
  return (
    <>
      <PageBanner
        eyebrow="Avhämtning"
        title="Meny & Beställ"
        text="Välj din rätt, anpassa efter smak och hämta hos oss i Vintrosa. Alla priser anges i kronor."
      />
      <MenuBrowser />
    </>
  );
}
