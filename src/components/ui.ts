type Variant = "gold" | "outline-light" | "outline-dark" | "ink";

const base =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-7 text-sm font-semibold transition-colors";

const variants: Record<Variant, string> = {
  gold: "bg-gold text-ink hover:bg-gold-light",
  "outline-light": "border border-gold/70 text-gold hover:bg-gold hover:text-ink",
  "outline-dark": "border border-ink/25 text-ink hover:border-ink hover:bg-ink hover:text-ivory",
  ink: "bg-ink text-ivory hover:bg-ink-3",
};

export const buttonClass = (variant: Variant = "gold") => `${base} ${variants[variant]}`;

/** Small gold overline used above section titles. */
export const eyebrow = "text-xs font-semibold uppercase tracking-[0.24em] text-gold-deep";
