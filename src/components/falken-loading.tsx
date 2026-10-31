function FalconEmblem({ className = "h-8 w-8 text-[#b88e4d]" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M32 4 C36 10, 48 12, 58 10 C54 18, 46 22, 40 24 C46 28, 54 29, 60 28 C52 35, 42 37, 34 35 C38 41, 46 45, 52 47 C42 50, 32 46, 26 40 C28 46, 30 52, 34 56 C26 54, 20 48, 18 42 C14 48, 10 52, 6 54 C10 46, 14 38, 18 30 C12 28, 6 24, 2 20 C10 20, 18 22, 24 26 C22 18, 24 10, 32 4 Z" />
    </svg>
  );
}

export interface FalkenLoadingProps {
  /** Optional custom message shown beneath the loader */
  label?: string;
  /** Full viewport height or fits inside a parent container */
  fullScreen?: boolean;
  className?: string;
}

export function FalkenLoading({
  label,
  fullScreen = true,
  className = "",
}: FalkenLoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label ?? "Laddar Falken Restaurang & Pizzeria"}
      className={`grid place-items-center bg-[#f9f8f4] px-4 transition-opacity duration-200 ${
        fullScreen ? "min-h-dvh w-full" : "py-16 w-full"
      } ${className}`}
    >
      <style>{`
        @keyframes falken-loader-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(225%); }
        }
      `}</style>
      <div className="flex flex-col items-center text-center">
        {/* Animated Falcon Emblem Badge */}
        <div className="relative mb-4 flex items-center justify-center">
          {/* Subtle warm aura pulse */}
          <div className="absolute -inset-2.5 rounded-2xl bg-[#b88e4d]/15 animate-ping opacity-50" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white border border-[#e8e2d5] shadow-xs">
            <FalconEmblem className="h-8 w-8 text-[#b88e4d] animate-pulse" />
          </div>
        </div>

        {/* Brand Title */}
        <div className="leading-tight">
          <span className="font-serif text-2xl font-bold tracking-[0.24em] text-[#1f2328] block uppercase">
            FALKEN
          </span>
          <span className="text-[9.5px] font-semibold tracking-[0.26em] text-[#8c827a] uppercase block mt-1">
            Restaurang &amp; Pizzeria
          </span>
        </div>

        {/* Indeterminate Golden Loading Bar - Light delicate track with actively gliding golden beam */}
        <div className="relative mt-5 h-1 w-36 overflow-hidden rounded-full bg-[#ebe4d6]">
          <div
            className="h-full w-[45%] rounded-full bg-gradient-to-r from-[#b88e4d] via-[#f3db98] to-[#b88e4d] shadow-[0_0_8px_rgba(184,142,77,0.35)]"
            style={{
              animation: "falken-loader-slide 1.15s cubic-bezier(0.4, 0, 0.2, 1) infinite",
            }}
          />
        </div>

        {/* Optional context message */}
        {label && (
          <p className="mt-2.5 text-xs text-[#7c828d] font-medium animate-pulse">
            {label}
          </p>
        )}

        {/* Italian Tricolor Accent */}
        <div className="mt-4 flex h-1 w-10 overflow-hidden rounded-full opacity-70">
          <div className="w-1/3 bg-[#009246]" />
          <div className="w-1/3 bg-white" />
          <div className="w-1/3 bg-[#ce2b37]" />
        </div>
      </div>
    </div>
  );
}

export default FalkenLoading;
