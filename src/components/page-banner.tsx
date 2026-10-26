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
    <section className="relative flex min-h-[16rem] flex-col justify-center overflow-hidden bg-ink-2 text-ivory sm:min-h-[18rem] lg:min-h-[23rem]">
      {aside}
      <div className="wrap relative w-full py-9 sm:py-12 lg:py-14">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-gold sm:text-xs sm:tracking-[0.28em]">{eyebrow}</p>
        <h1 className="mt-2 text-[1.85rem] font-medium uppercase leading-[1.05] min-[360px]:text-[2.2rem] sm:text-5xl md:text-6xl lg:text-7xl">{title}</h1>
        <p className="mt-4 max-w-xl text-[0.88rem] leading-relaxed text-ivory/75 sm:mt-5 sm:text-base">{text}</p>
        {children}
      </div>
    </section>
  );
}
