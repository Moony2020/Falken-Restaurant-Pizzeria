import Link from "next/link";
import { FalconEmblem } from "./icons";

export function Logo({ tone = "light" }: { tone?: "light" | "dark" }) {
  const main = tone === "light" ? "text-ivory" : "text-ink";
  const sub = tone === "light" ? "text-gold" : "text-gold-deep";
  return (
    <Link
      href="/"
      className="group inline-flex items-center gap-2.5 sm:gap-3 leading-none transition-opacity hover:opacity-90"
      aria-label="Falken – startsidan"
    >
      <FalconEmblem className={`size-7 sm:size-8 shrink-0 transition-transform duration-300 group-hover:scale-105 ${sub}`} />
      <span className="flex flex-col items-start leading-none">
        <span className={`font-display text-[1.45rem] font-medium tracking-[0.16em] sm:text-[1.85rem] ${main}`}>
          FALKEN
        </span>
        <span className={`mt-1 text-[0.5rem] font-medium uppercase tracking-[0.42em] sm:text-[0.56rem] sm:tracking-[0.48em] ${sub}`}>
          Restaurang &amp; Pizzeria
        </span>
      </span>
    </Link>
  );
}
