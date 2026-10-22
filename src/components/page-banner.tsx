import type { ReactNode } from "react";

/**
 * Dark page header. `children` sit under the text (e.g. a search field); `aside` is a decorative picture on the right
 * from the "lg" breakpoint up, hidden on small screens so the text keeps the room.
 */
export function PageBanner({
  eyebrow,
  title,
  text,
  children,
  aside,
}: {
  eyebrow: string;
  title: string;
  text: string;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden bg-ink-2 text-ivory">
      {aside}
      <div className="wrap relative pb-14 pt-8 sm:pb-20 sm:pt-12">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gold">{eyebrow}</p>
        <h1 className="mt-2 text-5xl font-medium uppercase leading-none sm:text-7xl">{title}</h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-ivory/75">{text}</p>
        {children}
      </div>
    </section>
  );
}
