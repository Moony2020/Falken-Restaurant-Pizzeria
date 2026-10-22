import type { CategoryId } from "@/data/menu";

// Illustrated stand-ins used until real photography is added (plan §9, phase 1).
// Drop a file into /public/images and set `image` on the product or gallery item to replace them.

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type PizzaArtProps = { seed?: number; className?: string; label?: string };

/** Top-down pizza drawn in SVG. Deterministic per seed so SSR and client always match. */
export function PizzaArt({ seed = 1, className, label }: PizzaArtProps) {
  const r = rng(seed * 9973);
  const id = `pz${seed}`;
  // Trig results differ in the last digits between server and browser; rounding keeps hydration stable.
  const q = (v: number) => Math.round(v * 10) / 10;
  const pos = (maxR: number) => {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * maxR;
    return { x: q(200 + Math.cos(a) * d), y: q(200 + Math.sin(a) * d), a: q((a * 180) / Math.PI) };
  };

  const chars = Array.from({ length: 26 }, () => {
    const a = r() * Math.PI * 2;
    const d = 166 + r() * 18;
    return { x: q(200 + Math.cos(a) * d), y: q(200 + Math.sin(a) * d), r: q(2.5 + r() * 6) };
  });
  const cheese = Array.from({ length: 9 }, () => ({ ...pos(112), rx: q(20 + r() * 20), ry: q(14 + r() * 14) }));
  const ham = Array.from({ length: 4 }, () => ({ ...pos(100), rot: q(r() * 360) }));
  const leaves = Array.from({ length: 6 }, () => ({ ...pos(112), rot: q(r() * 360), s: q(0.8 + r() * 0.5) }));

  return (
    <svg
      viewBox="0 0 400 400"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <radialGradient id={`${id}c`} cx="50%" cy="45%" r="55%">
          <stop offset="0.7" stopColor="#dca85f" />
          <stop offset="1" stopColor="#b2742f" />
        </radialGradient>
        <radialGradient id={`${id}s`} cx="50%" cy="50%" r="55%">
          <stop offset="0" stopColor="#d4482f" />
          <stop offset="1" stopColor="#a02a1c" />
        </radialGradient>
        <radialGradient id={`${id}m`} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#fdf4d9" />
          <stop offset="1" stopColor="#ecd7a0" />
        </radialGradient>
        <linearGradient id={`${id}l`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5d9a45" />
          <stop offset="1" stopColor="#2f6a2d" />
        </linearGradient>
        <filter id={`${id}b`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <circle cx="206" cy="212" r="190" fill="#000" opacity="0.35" filter={`url(#${id}b)`} />
      <circle cx="200" cy="200" r="190" fill={`url(#${id}c)`} />
      <circle cx="200" cy="200" r="182" fill="none" stroke="#f0c27f" strokeOpacity="0.5" strokeWidth="3" />
      {chars.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={c.r} fill="#3f2110" opacity="0.75" />
      ))}
      <circle cx="200" cy="200" r="152" fill={`url(#${id}s)`} />
      {cheese.map((c, i) => (
        <ellipse key={i} cx={c.x} cy={c.y} rx={c.rx} ry={c.ry} transform={`rotate(${c.a} ${c.x} ${c.y})`} fill={`url(#${id}m)`} />
      ))}
      {ham.map((h, i) => (
        <g key={i} transform={`translate(${h.x} ${h.y}) rotate(${h.rot})`}>
          <path d="M-34 -4C-30-26 6-30 30-14 40-6 34 18 10 22-18 26-38 14-34-4Z" fill="#d68b94" />
          <path d="M-24 -4C-18-18 8-20 24-10" fill="none" stroke="#f1bcc0" strokeWidth="4" strokeLinecap="round" opacity="0.85" />
          <path d="M-6 4C4 8 14 6 24 10" fill="none" stroke="#b8606c" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
        </g>
      ))}
      {leaves.map((l, i) => (
        <g key={i} transform={`translate(${l.x} ${l.y}) rotate(${l.rot}) scale(${l.s})`}>
          <path d="M-22 0C-12-16 12-16 24 0 12 16-12 16-22 0Z" fill={`url(#${id}l)`} />
          <path d="M-20 0H20" stroke="#bfe3a6" strokeWidth="1.5" opacity="0.7" />
        </g>
      ))}
    </svg>
  );
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Glyph({ kind }: { kind: Exclude<CategoryId, "pizza" | "kebabpizza"> }) {
  switch (kind) {
    case "kebab":
      return (
        <g {...stroke} transform="rotate(-35 32 32)">
          <rect x="10" y="22" width="44" height="20" rx="10" />
          <path d="M44 22c-4 5-4 15 0 20M16 29h18M16 35h14" />
        </g>
      );
    case "hamburgare":
      return (
        <g {...stroke}>
          <path d="M12 30a20 14 0 0 1 40 0Z" />
          <path d="M10 36c4 3 8 3 11 0s8 3 11 0 8 3 11 0 8 3 11 0" />
          <path d="M12 42h40v3a6 6 0 0 1-6 6H18a6 6 0 0 1-6-6Z" />
        </g>
      );
    case "sallader":
      return (
        <g {...stroke}>
          <path d="M10 32h44a22 20 0 0 1-44 0Z" />
          <path d="M20 32c-2-8 2-14 8-16 2 6 0 12-4 16M34 32c0-8 4-14 12-14 0 7-4 12-10 14" />
        </g>
      );
    case "alacarte":
    case "lunch":
      return (
        <g {...stroke}>
          <circle cx="32" cy="32" r="16" />
          <circle cx="32" cy="32" r="9" />
          <path d="M9 14v14m-4-14v8a4 4 0 0 0 8 0v-8M59 14c-4 3-5 9-5 14h5V14ZM59 28v22M9 28v22" />
        </g>
      );
    case "barn":
      return (
        <g {...stroke}>
          <path d="m32 11 6.5 13.5 14.5 2-10.5 10.2 2.5 14.6L32 44.5 18.9 51.3l2.6-14.6L11 26.5l14.5-2Z" />
        </g>
      );
    case "dryck":
      return (
        <g {...stroke}>
          <path d="M19 14h26l-3.5 38h-19ZM21 26h22" />
          <path d="M36 14l6-8" />
        </g>
      );
  }
}

export function DishArt({
  category,
  seed = 1,
  className = "",
}: {
  category: CategoryId;
  seed?: number;
  className?: string;
}) {
  const isPizza = category === "pizza" || category === "kebabpizza";
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_30%_20%,var(--color-ink-3),var(--color-ink))] ${className}`}
      aria-hidden="true"
    >
      {isPizza ? (
        <PizzaArt seed={seed} className="h-[86%] w-[86%]" />
      ) : (
        <svg viewBox="0 0 64 64" className="h-1/2 w-1/2 text-gold">
          <Glyph kind={category} />
        </svg>
      )}
    </div>
  );
}
