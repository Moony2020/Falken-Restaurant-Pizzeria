import Image from "next/image";

export function GalleryHero() {
  return (
    <section className="relative w-full overflow-hidden bg-ink py-16 sm:py-24 md:py-28">
      {/* Background Image: Gallery Hero */}
      <Image
        src="/images/gallery/gallery-hero.webp"
        alt="Falken Restaurang & Pizzeria – Galleri"
        fill
        priority
        quality={92}
        className="object-cover object-center"
        sizes="100vw"
      />

      {/* Atmospheric dark gradient overlay ensuring high contrast and warm glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-black/75" />

      {/* Centered Content */}
      <div className="relative z-10 mx-auto max-w-3xl px-4 text-center">
        {/* Camera icon with golden decorative horizontal wings */}
        <div className="flex items-center justify-center gap-3 sm:gap-4 mb-2.5 sm:mb-3.5">
          <div className="h-px w-10 sm:w-16 bg-gradient-to-r from-transparent to-[#b88e4d]" />
          <div className="text-[#b88e4d]">
            <svg
              viewBox="0 0 24 24"
              className="size-6 sm:size-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
          <div className="h-px w-10 sm:w-16 bg-gradient-to-l from-transparent to-[#b88e4d]" />
        </div>

        {/* Title */}
        <h1 className="font-display text-3xl font-normal uppercase tracking-[0.22em] text-white drop-shadow-md sm:text-4xl md:text-5xl lg:text-[3.25rem]">
          GALLERI
        </h1>

        {/* Subtitle */}
        <p className="mt-2 text-xs font-light tracking-wide text-ivory/90 drop-shadow-sm sm:mt-3 sm:text-sm md:text-base max-w-xl mx-auto">
          Ett urval av våra rätter och vår restaurang i Vintrosa.
        </p>

        {/* Elegant Golden Flourish Wave underneath subtitle */}
        <div className="mt-2.5 sm:mt-3.5 flex justify-center">
          <svg
            viewBox="0 0 120 12"
            className="w-24 sm:w-32 h-2.5 sm:h-3 text-[#b88e4d]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M5 6 Q 30 1, 60 6 T 115 6" />
          </svg>
        </div>
      </div>
    </section>
  );
}

