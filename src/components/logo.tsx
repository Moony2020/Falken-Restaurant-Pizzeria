import Link from "next/link";

export function Logo({ tone = "light" }: { tone?: "light" | "dark" }) {
  const main = tone === "light" ? "text-ivory" : "text-ink";
  const sub = tone === "light" ? "text-gold" : "text-gold-deep";
  return (
    <Link href="/" className="group inline-flex flex-col items-center leading-none" aria-label="Falken – startsidan">
      <span className={`font-display text-[1.65rem] font-medium tracking-[0.16em] sm:text-[2.1rem] ${main}`}>
        FALKEN
      </span>
      <span className={`mt-1 text-[0.54rem] font-medium uppercase tracking-[0.45em] sm:text-[0.58rem] sm:tracking-[0.5em] ${sub}`}>
        Restaurang &amp; Pizzeria
      </span>
    </Link>
  );
}
