import { rng } from "./art";

/**
 * Large, detailed pizza for the home-page hero: stone-baked blistered crust, pooled mozzarella, prosciutto and basil
 * on a white plate. Still an illustration: drop a photo into /public/images and set `heroImage` in data/site.ts to replace it.
 */
export function HeroPizza({ className }: { className?: string }) {
  const r = rng(20261022);
  // Trig results differ in the last digits between server and browser; rounding keeps hydration stable.
  const q = (v: number) => Math.round(v * 10) / 10;
  const polar = (maxR: number, minR = 0) => {
    const a = r() * Math.PI * 2;
    const d = minR + Math.sqrt(r()) * (maxR - minR);
    return { x: q(250 + Math.cos(a) * d), y: q(250 + Math.sin(a) * d), rot: q(r() * 360) };
  };

  const blisters = Array.from({ length: 38 }, () => {
    const a = r() * Math.PI * 2;
    const d = 176 + r() * 28;
    return {
      x: q(250 + Math.cos(a) * d),
      y: q(250 + Math.sin(a) * d),
      rx: q(3 + r() * 10),
      ry: q(2.5 + r() * 7),
      rot: q((a * 180) / Math.PI),
      dark: r() > 0.35,
    };
  });
  const flour = Array.from({ length: 30 }, () => {
    const a = r() * Math.PI * 2;
    const d = 172 + r() * 32;
    return { x: q(250 + Math.cos(a) * d), y: q(250 + Math.sin(a) * d), rx: q(2 + r() * 6), ry: q(1.5 + r() * 3.5) };
  });
  const cheese = Array.from({ length: 8 }, () => ({ ...polar(125, 10), rx: q(30 + r() * 18), ry: q(22 + r() * 14) }));
  const ham = Array.from({ length: 5 }, () => ({ ...polar(120, 30), s: q(0.9 + r() * 0.35) }));
  const basil = Array.from({ length: 7 }, () => ({ ...polar(140, 15), s: q(0.8 + r() * 0.55) }));
  const sheen = Array.from({ length: 12 }, () => ({ ...polar(150, 20), rx: q(6 + r() * 12), ry: q(2.5 + r() * 4) }));
  const pepper = Array.from({ length: 16 }, () => ({ ...polar(150, 10), r: q(0.9 + r() * 1.6) }));

  return (
    <svg viewBox="0 0 500 500" className={className} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="hp-plate" cx="40%" cy="35%" r="75%">
          <stop offset="0" stopColor="#fbfaf6" />
          <stop offset="1" stopColor="#dcd6c8" />
        </radialGradient>
        <radialGradient id="hp-crust" cx="50%" cy="42%" r="58%">
          <stop offset="0.55" stopColor="#f0bd72" />
          <stop offset="0.9" stopColor="#d9953f" />
          <stop offset="1" stopColor="#b8721f" />
        </radialGradient>
        <radialGradient id="hp-sauce" cx="45%" cy="40%" r="62%">
          <stop offset="0" stopColor="#d84a2f" />
          <stop offset="0.7" stopColor="#b3321f" />
          <stop offset="1" stopColor="#8f2416" />
        </radialGradient>
        <radialGradient id="hp-cheese" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#fffaea" />
          <stop offset="0.65" stopColor="#f6e6b8" />
          <stop offset="1" stopColor="#e3c47d" />
        </radialGradient>
        <linearGradient id="hp-ham" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#efb3b6" />
          <stop offset="1" stopColor="#c9737c" />
        </linearGradient>
        <linearGradient id="hp-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6fae4c" />
          <stop offset="1" stopColor="#2c6a2b" />
        </linearGradient>
        <filter id="hp-rough" x="-6%" y="-6%" width="112%" height="112%">
          <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="3" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="16" />
        </filter>
        <filter id="hp-soft" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="9" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="9" />
        </filter>
        <filter id="hp-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="2" result="t" />
          <feColorMatrix in="t" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.2  0 0 0 0 0.08  0 0 0 1.4 -0.45" result="c" />
          <feComposite in="c" in2="SourceAlpha" operator="in" />
        </filter>
        <filter id="hp-pop" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.6" floodColor="#2a0d05" floodOpacity="0.45" />
        </filter>
        <filter id="hp-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
        <filter id="hp-blur-s" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>

      {/* plate and its shadow */}
      <circle cx="262" cy="276" r="236" fill="#000" opacity="0.5" filter="url(#hp-blur)" />
      <circle cx="250" cy="250" r="240" fill="url(#hp-plate)" />
      <circle cx="250" cy="250" r="214" fill="none" stroke="#cfc8b8" strokeWidth="2" opacity="0.8" />

      {/* crust */}
      <circle cx="250" cy="250" r="206" fill="url(#hp-crust)" filter="url(#hp-rough)" />
      <circle cx="250" cy="250" r="206" fill="#fff" filter="url(#hp-grain)" opacity="0.4" />
      <circle cx="250" cy="250" r="196" fill="none" stroke="#f6cf92" strokeWidth="5" opacity="0.45" filter="url(#hp-blur-s)" />
      {flour.map((f, i) => (
        <ellipse key={`f${i}`} cx={f.x} cy={f.y} rx={f.rx} ry={f.ry} fill="#f9e4bd" opacity="0.4" />
      ))}
      {blisters.map((b, i) => (
        <ellipse
          key={`b${i}`}
          cx={b.x}
          cy={b.y}
          rx={b.rx}
          ry={b.ry}
          transform={`rotate(${b.rot} ${b.x} ${b.y})`}
          fill={b.dark ? "#4b2a10" : "#8a5522"}
          opacity={b.dark ? 0.82 : 0.55}
          filter="url(#hp-blur-s)"
        />
      ))}

      {/* sauce */}
      <circle cx="250" cy="250" r="168" fill="url(#hp-sauce)" filter="url(#hp-soft)" />
      <circle cx="250" cy="250" r="168" fill="none" stroke="#5e130b" strokeWidth="5" opacity="0.35" filter="url(#hp-blur-s)" />

      {/* toppings */}
      <g filter="url(#hp-pop)">
        <g filter="url(#hp-soft)">
          {cheese.map((c, i) => (
            <g key={`c${i}`} transform={`rotate(${c.rot} ${c.x} ${c.y})`}>
              <ellipse cx={c.x} cy={c.y} rx={c.rx} ry={c.ry} fill="url(#hp-cheese)" />
              <ellipse cx={q(c.x + c.rx * 0.25)} cy={q(c.y - c.ry * 0.2)} rx={q(c.rx * 0.22)} ry={q(c.ry * 0.18)} fill="#d79a3c" opacity="0.4" />
              <ellipse cx={q(c.x - c.rx * 0.3)} cy={q(c.y + c.ry * 0.25)} rx={q(c.rx * 0.14)} ry={q(c.ry * 0.12)} fill="#c98631" opacity="0.35" />
            </g>
          ))}
        </g>

        {ham.map((h, i) => (
          <g key={`h${i}`} transform={`translate(${h.x} ${h.y}) rotate(${h.rot}) scale(${h.s})`}>
            <path d="M-48 -6C-42-32 -6-40 22-28 46-18 54 6 40 24 24 40 -8 42 -32 30 -46 22 -52 8 -48 -6Z" fill="url(#hp-ham)" />
            <path d="M-30 -8C-14-26 14-24 36-8" fill="none" stroke="#fbd3d5" strokeWidth="6" strokeLinecap="round" opacity="0.85" />
            <path d="M-34 14C-12 24 12 26 34 18" fill="none" stroke="#a9505c" strokeWidth="4" strokeLinecap="round" opacity="0.55" />
            <path d="M-4 -26C2 -8 4 10 -2 28" fill="none" stroke="#b9606c" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
          </g>
        ))}

        {basil.map((b, i) => (
          <g key={`l${i}`} transform={`translate(${b.x} ${b.y}) rotate(${b.rot}) scale(${b.s})`}>
            <path d="M0 -28C18 -24 30 -6 28 11 26 26 9 36 0 42 -9 36 -26 26 -28 11 -30 -6 -18 -24 0 -28Z" fill="url(#hp-leaf)" />
            <path d="M0 -24V38" stroke="#c4e5a8" strokeWidth="2" opacity="0.85" />
            <path d="M0 -6L-14 -14M0 6L-16 -2M0 18L-12 12M0 -6L14 -14M0 6L16 -2M0 18L12 12" stroke="#a8d58a" strokeWidth="1.3" opacity="0.65" />
          </g>
        ))}
      </g>

      {sheen.map((s, i) => (
        <ellipse key={`s${i}`} cx={s.x} cy={s.y} rx={s.rx} ry={s.ry} fill="#fff" opacity="0.16" transform={`rotate(${s.rot} ${s.x} ${s.y})`} />
      ))}
      {pepper.map((p, i) => (
        <circle key={`p${i}`} cx={p.x} cy={p.y} r={p.r} fill="#241108" opacity="0.7" />
      ))}
    </svg>
  );
}
