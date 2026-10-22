export function PageBanner({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <section className="bg-ink-2 text-ivory">
      <div className="wrap pb-14 pt-8 sm:pb-20 sm:pt-12">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gold">{eyebrow}</p>
        <h1 className="mt-2 text-5xl font-medium uppercase leading-none sm:text-7xl">{title}</h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-ivory/75">{text}</p>
      </div>
    </section>
  );
}
