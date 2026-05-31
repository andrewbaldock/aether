import { useId } from "react";

// Aether mark — the neon "A" in Ubuntu, with CRT scanlines and a 60/40 pink→cyan
// diagonal gradient (cyan top-right → pink bottom-left). Renders identically on dark,
// light, and art themes (the scanlines give the glow dark gaps to bleed into).
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
  const scan = `scan-${uid}`;
  const mask = `mask-${uid}`;

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
        <filter id={glow} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b1" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="b2" />
          <feMerge>
            <feMergeNode in="b2" />
            <feMergeNode in="b1" />
          </feMerge>
        </filter>

        {/* Pink(bottom-left) → cyan(top-right), even 50/50, subtle upward slant */}
        <linearGradient id={grad} x1="0" y1="0.65" x2="1" y2="0.35">
          <stop offset="0%" stopColor="#ff2e9a" />
          <stop offset="50%" stopColor="#b54bd0" />
          <stop offset="100%" stopColor="#16c2ff" />
        </linearGradient>

        <pattern id={scan} width="10" height="13" patternUnits="userSpaceOnUse">
          <rect width="10" height="8" fill="#fff" />
          <rect y="8" width="10" height="5" fill="#000" />
        </pattern>
        <mask id={mask}>
          <rect width="130" height="130" fill={`url(#${scan})`} />
        </mask>
      </defs>

      {/* Glow behind (un-masked) + crisp scanlined letter on top */}
      <g filter={`url(#${glow})`} opacity={0.9}>
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
      </g>
      <g mask={`url(#${mask})`}>
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
      </g>
    </svg>
  );
}
