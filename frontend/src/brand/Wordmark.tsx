import { useId } from "react";

// Aether wordmark — "Aether" in Grenze Gotisch (modern blackletter) with the pink→cyan
// diagonal gradient (cyan top-right → pink bottom-left). Works across all three themes.
//
// Solid gradient letters, no glow — crisp blackletter strokes carry the brand on their
// own. `height` drives the size.
//
// Requires the "Grenze Gotisch" font — loaded in index.html.
//
// `compact` renders just the capital "A" (matching the favicon) in a square box —
// used in the sidebar when the full hero wordmark is already on screen, so the
// brand doesn't read twice.
// `decorative` drops the <title> (and its native browser tooltip) plus the
// aria-label — use it when the wordmark sits inside a labelled control (e.g. the
// sidebar's "new conversation" button) so the SVG's "Aether" tooltip doesn't
// compete with the parent's own tooltip/label.
export function Wordmark({
  height = 40,
  title = "Aether",
  compact = false,
  decorative = false,
}: {
  height?: number;
  title?: string;
  compact?: boolean;
  decorative?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const grad = `grad-${uid}`;

  // Full: viewBox cropped to 600×112 to hug the letters (baseline y=98, fontSize 108) —
  // the old 0 0 600 130 box left dead space below the baseline that pushed the header's
  // centered toggle/theme icons visually low. Compact: a square box around the lone "A",
  // centred horizontally, same baseline. Width follows the active box's aspect ratio.
  const viewBox = compact ? "230 6 140 112" : "0 6 600 112";
  const aspect = compact ? 140 / 112 : 600 / 112;
  const width = Math.round(height * aspect);

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
      {compact ? "A" : "Aether"}
    </text>
  );

  return (
    <svg
      width={width}
      height={height}
      viewBox={viewBox}
      role={decorative ? "presentation" : "img"}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative || undefined}
      xmlns="http://www.w3.org/2000/svg"
    >
      {!decorative && <title>{title}</title>}
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
