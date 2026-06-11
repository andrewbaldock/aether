// On-brand loading animation for Bigsail — the first thing a new visitor watches
// while the first answer composes. Placeholder cards drift up into formation on
// staggered delays (the .bigsail-loading-card animation lives in index.css), each
// outlined in a brand neon, reading as "the canvas is assembling itself". Pure
// CSS/SVG, no deps. Models after KnowledgeGraph/GraphLoading (the existing
// non-spinner reference).

// Placeholder cards laid out as a loose sail/fan. Concrete coords so we don't
// measure; the neon border alternates pink↔cyan per card.
const GHOST_CARDS: {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  neon: string;
}[] = [
  { id: "a", x: 24, y: 60, w: 96, h: 64, neon: "var(--neon-pink, #ff2e9a)" },
  { id: "b", x: 138, y: 28, w: 80, h: 96, neon: "var(--neon-cyan, #16c2ff)" },
  { id: "c", x: 234, y: 70, w: 104, h: 56, neon: "var(--neon-pink, #ff2e9a)" },
  { id: "d", x: 96, y: 138, w: 88, h: 60, neon: "var(--neon-cyan, #16c2ff)" },
  { id: "e", x: 202, y: 142, w: 96, h: 72, neon: "var(--neon-pink, #ff2e9a)" },
];

export function BigsailLoading() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <svg
        width="360"
        height="240"
        viewBox="0 0 360 240"
        role="img"
        aria-label="Composing the canvas"
        className="max-w-full"
      >
        <title>Composing the canvas</title>
        {GHOST_CARDS.map((card, i) => (
          <rect
            key={card.id}
            x={card.x}
            y={card.y}
            width={card.w}
            height={card.h}
            rx={8}
            fill="var(--surface-elevated, rgba(255,255,255,0.04))"
            stroke={card.neon}
            strokeWidth={1.5}
            className="bigsail-loading-card"
            style={{ animationDelay: `${i * 180}ms` }}
          />
        ))}
      </svg>
      <p className="font-display text-sm font-medium text-content-muted">
        Composing the canvas…
      </p>
    </div>
  );
}
