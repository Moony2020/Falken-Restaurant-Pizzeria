import type { Metadata } from "next";
import { CheckoutPageView } from "@/components/order/checkout-page-view";

export const metadata: Metadata = {
  title: "Kassa",
  description: "Fyll i dina uppgifter och betala din beställning säkert med kort.",
  alternates: { canonical: "/kassa" },
};

export default function KassaPage() {
  return <CheckoutPageView />;
}
