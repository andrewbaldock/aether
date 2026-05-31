import { useId } from "react";

// Aether wordmark — "AETHER" in neon Ubuntu with CRT scanlines and the 60/40 pink→cyan
// diagonal gradient (cyan top-right → pink bottom-left). Works across all three themes.
//
// Two layers: a glowing un-masked copy behind (the bloom) + a crisp scanlined copy on
// top. This keeps BOTH the halo and the visible scanlines — masking the glowing copy
// directly would fill the gaps back in.
//
// Requires the "Ubuntu" font (700) — loaded in index.html. `height` drives the size.
export function Wordmark({
  height = 40,
  title = "Aether",
}: {
  height?: number;
  title?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const glow = `glow-${uid}`;
  const grad = `grad-${uid}`;
  const scan = `scan-${uid}`;
  const mask = `mask-${uid}`;

  const width = Math.round(height * 4.6);

  const text = (
    <text
      x="300"
      y="100"
      textAnchor="middle"
      fontFamily="Ubuntu, ui-sans-serif, system-ui, sans-serif"
      fontWeight={700}
      fontSize={104}
      letterSpacing={4}
      fill={`url(#${grad})`}
    >
      AETHER
    </text>
  );

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 600 130"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <defs>
        {/* Matches the explorations page: 5 / 13 blur for a generous bloom. */}
        <filter id={glow} x="-30%" y="-80%" width="160%" height="260%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b1" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="13" result="b2" />
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

        {/* Matches the explorations page: 5-unit period, 1.8-unit gap — fine CRT lines. */}
        <pattern id={scan} width="10" height="5" patternUnits="userSpaceOnUse">
          <rect width="10" height="3.2" fill="#fff" />
          <rect y="3.2" width="10" height="1.8" fill="#000" />
        </pattern>
        <mask id={mask}>
          <rect width="600" height="130" fill={`url(#${scan})`} />
        </mask>
      </defs>

      {/* Layer 1 — soft bloom, un-masked (the glow blooms freely) */}
      <g filter={`url(#${glow})`} opacity={0.9}>
        {text}
      </g>
      {/* Layer 2 — crisp scanlined letters on top */}
      <g mask={`url(#${mask})`}>{text}</g>
    </svg>
  );
}
