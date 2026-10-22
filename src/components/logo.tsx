import Link from "next/link";

export function Logo({ tone = "light" }: { tone?: "light" | "dark" }) {
  const main = tone === "light" ? "text-ivory" : "text-ink";
  const sub = tone === "light" ? "text-gold" : "text-gold-deep";
  return (
    <Link href="/" className="group inline-flex flex-col items-center leading-none" aria-label="Falken – startsidan">
      <span className={`font-display text-[2rem] font-medium tracking-[0.12em] sm:text-[2.4rem] ${main}`}>
        FALKEN
      </span>
      <span className={`mt-1 text-[0.58rem] font-medium uppercase tracking-[0.42em] ${sub}`}>
        Restaurang &amp; Pizzeria
      </span>
    </Link>
  );
}
