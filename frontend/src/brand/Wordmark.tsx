import { useId } from "react";

// Aether wordmark — "Aether" in Grenze Gotisch (modern blackletter) with the pink→cyan
// diagonal gradient (cyan top-right → pink bottom-left). Works across all three themes.
//
// Solid gradient letters, no glow — crisp blackletter strokes carry the brand on their
// own. `height` drives the size.
//
// Requires the "Grenze Gotisch" font — loaded in index.html.
export function Wordmark({
  height = 40,
  title = "Aether",
}: {
  height?: number;
  title?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const grad = `grad-${uid}`;

  const width = Math.round(height * 4.4);

  const text = (
    <text
      x="300"
      y="98"
      textAnchor="middle"
      fontFamily="'Grenze Gotisch', ui-sans-serif, system-ui, sans-serif"
      fontWeight={600}
      fontSize={108}
      letterSpacing={1}
      fill={`url(#${grad})`}
    >
      Aether
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
        {/* Pink(bottom-left) → cyan(top-right), even 50/50, subtle upward slant */}
        <linearGradient id={grad} x1="0" y1="0.65" x2="1" y2="0.35">
          <stop offset="0%" stopColor="#ff2e9a" />
          <stop offset="50%" stopColor="#b54bd0" />
          <stop offset="100%" stopColor="#16c2ff" />
        </linearGradient>
      </defs>

      {/* Solid crisp letters, no glow */}
      <g>{text}</g>
    </svg>
  );
}
