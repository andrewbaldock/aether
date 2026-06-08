import { useId } from "react";

// The "thinking" indicator: the Aether "A" (Grenze Gotisch) in the brand pink→cyan
// gradient. Two states, driven by `animate`:
//
//  • idle    — a single clean solid gradient "A" (matches the wordmark + favicon).
//  • thinking — Warhol motion: three colored copies of the A (pink / purple / cyan) drift
//    apart over a field of softly pulsing graph nodes, then converge and STACK at center,
//    HOLDING a beat in the united state before drifting apart again. The pink copy is drawn
//    last (on top) at full opacity, so pink "wins" where they overlap. Ping-pong, no dead gap.
//    The pulsing nodes tie the glyph to the Knowledge Graph.
//
// Nodes sit on coordinates sampled from the real Grenze Gotisch "A" outline (100×100 box).
// Requires the "Grenze Gotisch" font — loaded in index.html.
//
// `height` drives the size; the glyph is square so width matches.

// Sampled points along the Grenze Gotisch "A" outline (0..100 box).
const NODES: [number, number][] = [
  [6.3, 35.6],
  [28.9, 40.8],
  [36.2, 88.8],
  [6.9, 85.0],
  [10.0, 37.5],
  [68.5, 51.0],
  [41.8, 46.2],
  [47.3, 41.6],
  [38.3, 90.1],
  [37.7, 37.5],
  [0.1, 12.8],
  [49.2, 3.9],
  [89.4, 31.2],
  [89.4, 84.4],
  [67.0, 91.1],
  [67.0, 37.9],
];

// Shared cycle for the thinking animation. Longer hold in the united state.
const DUR = 3.4;
// keyTimes: drift … MEET at 0.46 … united HOLD through 0.66 … drift again.
const KT = "0;0.18;0.34;0.46;0.66;0.82;1";
const SPL =
  "0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1";

// Per-copy drift paths (x y). All return to "0 0" at the MEET + HOLD keyframes (0.46, 0.66)
// so the three copies register exactly at center for the whole united beat.
const DRIFT = {
  pink: "-14 -10; -8 6; -16 2; 0 0; 0 0; -6 8; -14 -10",
  mid: "12 -8; 16 4; 4 -14; 0 0; 0 0; 8 -10; 12 -8",
  cyan: "4 14; -6 -12; 12 10; 0 0; 0 0; 10 8; 4 14",
} as const;

export function ThinkingGlyph({
  height = 36,
  animate = false,
  title = "Thinking",
}: {
  height?: number;
  animate?: boolean;
  title?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const grad = `tgrad-${uid}`;

  // Respect reduced-motion: SMIL ignores the CSS media query, so gate it here — reduced-motion
  // users get the clean static gradient "A" even while the agent is thinking.
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const moving = animate && !reduceMotion;

  // A drifting colored copy (used only while thinking). Pink rides at full opacity on top;
  // the other two are semi-transparent so overlaps blend (and pink dominates the stack).
  const driftA = (color: string, vals: string, opacity: number) => (
    <text
      x="50"
      y="78"
      textAnchor="middle"
      fontFamily="'Grenze Gotisch', serif"
      fontWeight={600}
      fontSize={92}
      fill={color}
      opacity={opacity}
    >
      A
      <animateTransform
        attributeName="transform"
        type="translate"
        values={vals}
        keyTimes={KT}
        dur={`${DUR}s`}
        calcMode="spline"
        keySplines={SPL}
        repeatCount="indefinite"
      />
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
    >
      <title>{title}</title>
      <defs>
        {/* Pink(bottom-left) → cyan(top-right) — same gradient as the wordmark/favicon. */}
        <linearGradient id={grad} x1="0" y1="0.65" x2="1" y2="0.35">
          <stop offset="0%" stopColor="#ff2e9a" />
          <stop offset="50%" stopColor="#b54bd0" />
          <stop offset="100%" stopColor="#16c2ff" />
        </linearGradient>
      </defs>

      {moving ? (
        <>
          {/* pulsing graph nodes behind the letter */}
          {NODES.map(([cx, cy], i) => (
            <circle
              key={`${cx}-${cy}`}
              cx={cx}
              cy={cy}
              r={2}
              fill={i / NODES.length < 0.5 ? "#ff2e9a" : "#16c2ff"}
            >
              <animate
                attributeName="r"
                values="0.5;2.8;0.5"
                dur="1.8s"
                begin={`${i * 0.09}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.3;1;0.3"
                dur="1.8s"
                begin={`${i * 0.09}s`}
                repeatCount="indefinite"
              />
            </circle>
          ))}

          {/* three drifting colored A's that converge — cyan + purple semi-transparent so
              overlaps blend; pink drawn LAST at full opacity, so pink wins the stack. */}
          {driftA("#16c2ff", DRIFT.cyan, 0.55)}
          {driftA("#b54bd0", DRIFT.mid, 0.55)}
          {driftA("#ff2e9a", DRIFT.pink, 1)}
        </>
      ) : (
        /* idle — a single clean solid gradient A */
        <text
          x="50"
          y="78"
          textAnchor="middle"
          fontFamily="'Grenze Gotisch', serif"
          fontWeight={600}
          fontSize={92}
          fill={`url(#${grad})`}
        >
          A
        </text>
      )}
    </svg>
  );
}
