import Link from "next/link";
import { FalconEmblem } from "./icons";

export function Logo({ tone = "light" }: { tone?: "light" | "dark" }) {
  const main = tone === "light" ? "text-ivory" : "text-ink";
  const sub = tone === "light" ? "text-gold" : "text-gold-deep";
  return (
    <Link
      href="/"
      className="group inline-flex flex-col items-center leading-none transition-opacity hover:opacity-90"
      aria-label="Falken – startsidan"
    >
      <div className="inline-flex items-center gap-2 sm:gap-2.5">
        <FalconEmblem
          className={`size-6 sm:size-7 shrink-0 transition-transform duration-300 group-hover:scale-105 ${sub}`}
        />
        <span
          className={`font-display text-[1.35rem] font-medium tracking-[0.18em] sm:text-[1.75rem] ${main}`}
        >
          FALKEN
        </span>
      </div>
      <span
        className={`mt-1 text-center text-[0.46rem] font-medium uppercase tracking-[0.38em] sm:text-[0.54rem] sm:tracking-[0.44em] translate-x-2.5 sm:translate-x-3 ${sub}`}
      >
        Restaurang &amp; Pizzeria
      </span>
    </Link>
  );
}
