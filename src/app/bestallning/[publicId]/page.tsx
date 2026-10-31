import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderStatus } from "@/components/order/order-status";
import { FalkenLoading } from "@/components/falken-loading";

export const metadata: Metadata = {
  title: "Din beställning",
  robots: { index: false, follow: false },
};

// One placeholder so the page shell can be built ahead of time; every real order number is rendered when asked for.
export function generateStaticParams() {
  return [{ publicId: "placeholder" }];
}

export default function BestallningPage() {
  return (
    <main className="bg-ivory">
      <div className="wrap max-w-4xl py-8 sm:py-12">
        <Suspense fallback={<FalkenLoading fullScreen={false} label="Hämtar din beställning…" />}>
          <OrderStatus />
        </Suspense>
      </div>
    </main>
  );
}
