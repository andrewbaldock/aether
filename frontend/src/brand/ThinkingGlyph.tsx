import { useId } from "react";

// The "thinking" indicator: the hexagram ䷸ (U+4DF8, "Gentle Wind") — an
// aether/wind symbol of stacked platform rails — rendered with the Wordmark's
// scanline+glow treatment. Two layers of the same glyph: a soft bloom behind, a
// crisp scanlined copy on top. The scanlined layer breathes on the X axis
// (.aether-thinking-scan in index.css) so the CRT lines grow and shrink, giving a
// live pulse while the agent works. Mirrors Wordmark.tsx's masking approach so
// BOTH the halo and the scanline gaps survive.
//
// `height` drives the size; the glyph is square so width matches.
export function ThinkingGlyph({
  height = 20,
  animate = false,
  title = "Thinking",
}: {
  height?: number;
  animate?: boolean;
  title?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const glow = `tglow-${uid}`;
  const grad = `tgrad-${uid}`;
  const scan = `tscan-${uid}`;
  const mask = `tmask-${uid}`;

  const glyph = (
    <text
      x="50"
      y="52"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={84}
      fill={`url(#${grad})`}
    >
      ䷸
    </text>
  );

  return (
    <svg
      width={height}
      height={height}
      viewBox="0 0 100 100"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
      className={animate ? "aether-thinking-scan" : undefined}
    >
      <title>{title}</title>
      <defs>
        <filter id={glow} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b1" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b2" />
          <feMerge>
            <feMergeNode in="b2" />
            <feMergeNode in="b1" />
          </feMerge>
        </filter>

        {/* Same pink→cyan gradient as the Wordmark, for brand continuity. */}
        <linearGradient id={grad} x1="0" y1="0.65" x2="1" y2="0.35">
          <stop offset="0%" stopColor="#ff2e9a" />
          <stop offset="50%" stopColor="#b54bd0" />
          <stop offset="100%" stopColor="#16c2ff" />
        </linearGradient>

        {/* Fine horizontal CRT lines — same construction as the Wordmark. */}
        <pattern id={scan} width="10" height="5" patternUnits="userSpaceOnUse">
          <rect width="10" height="3.2" fill="#fff" />
          <rect y="3.2" width="10" height="1.8" fill="#000" />
        </pattern>
        <mask id={mask}>
          <rect width="100" height="100" fill={`url(#${scan})`} />
        </mask>
      </defs>

      {/* Layer 1 — soft bloom, un-masked (the glow blooms freely). */}
      <g filter={`url(#${glow})`} opacity={0.9}>
        {glyph}
      </g>
      {/* Layer 2 — crisp scanlined glyph, breathing on the X axis. */}
      <g mask={`url(#${mask})`}>{glyph}</g>
    </svg>
  );
}
