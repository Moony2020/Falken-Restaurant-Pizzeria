import type { Metadata } from "next";
import Link from "next/link";
import { GalleryGrid } from "@/components/gallery-grid";
import { PageBanner } from "@/components/page-banner";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = {
  title: "Galleri",
  description: "Se maten och miljön hos Restaurang & Pizzeria Falken i Vintrosa.",
  alternates: { canonical: "/galleri" },
};

export default function GalleriPage() {
  return (
    <>
      <PageBanner
        eyebrow="Smaka med ögonen"
        title="Galleri"
        text="Ett urval av våra rätter och vår restaurang i Vintrosa."
      />
      <div className="wrap py-12 sm:py-16">
        <GalleryGrid />
        <div className="mt-16 flex flex-col items-center gap-4 rounded-2xl bg-cream px-6 py-12 text-center">
          <h2 className="text-3xl font-medium uppercase sm:text-4xl">Sugen på något av det här?</h2>
          <p className="max-w-md text-sm text-muted">Beställ för avhämtning och hämta det nylagat hos oss.</p>
          <Link href="/meny" className={buttonClass("gold")}>
            Beställ online
          </Link>
        </div>
      </div>
    </>
  );
}
