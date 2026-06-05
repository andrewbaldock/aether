import { useId } from "react";

// Aether mark — the neon "A" in Ubuntu with a pink→cyan diagonal gradient
// (cyan top-right → pink bottom-left). A tight neon RIM (half opacity) behind a SOLID
// crisp "A" on top — sharp at small sizes rather than washed out by a soft bloom.
// Renders across dark, light, and art themes.
//
// Requires the "Ubuntu" font (700) to be loaded — see brand/fonts.css.
export function Logo({
  size = 40,
  title = "Aether",
}: {
  size?: number;
  title?: string;
}) {
  // Unique IDs so multiple instances on one page don't collide.
  const uid = useId().replace(/:/g, "");
  const glow = `glow-${uid}`;
  const grad = `grad-${uid}`;

  const letter = (
    <text
      x="65"
      y="104"
      textAnchor="middle"
      fontFamily="Ubuntu, ui-sans-serif, system-ui, sans-serif"
      fontWeight={700}
      fontSize={130}
      fill={`url(#${grad})`}
    >
      A
    </text>
  );

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 130 130"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <defs>
        {/* Single tight blur — a rim that hugs the edges, not a soft cloud. */}
        <filter id={glow} x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" />
        </filter>

        {/* Pink(bottom-left) → cyan(top-right), even 50/50, subtle upward slant */}
        <linearGradient id={grad} x1="0" y1="0.65" x2="1" y2="0.35">
          <stop offset="0%" stopColor="#ff2e9a" />
          <stop offset="50%" stopColor="#b54bd0" />
          <stop offset="100%" stopColor="#16c2ff" />
        </linearGradient>
      </defs>

      {/* Layer 1 — tight neon rim (half opacity) + Layer 2 — solid crisp letter */}
      <g filter={`url(#${glow})`} opacity={0.5}>
        {letter}
      </g>
      <g>{letter}</g>
    </svg>
  );
}
