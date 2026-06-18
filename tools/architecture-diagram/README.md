# Architecture diagram generator

Generates a detailed, multi-page **draw.io** architecture diagram of Aether from the live source,
and keeps it updated as the app grows. First run does a full generation (slow); after that it's
cheap incremental edits that preserve your manual layout tweaks.

> **Why draw.io and not Mermaid?** Mermaid's auto-layout falls apart on a diagram this dense.
> draw.io gives real layout control and clean SVG. The `.drawio` file is the editable source of
> truth; the `.svg` is the rendered image embedded in the README and `docs/ARCHITECTURE.md`.

## Run it

```bash
# from the repo root
bun run diagram          # generate (first time) or incrementally update
bun run diagram:full     # ignore the existing diagram, regenerate from scratch
bun run diagram:scan     # just print the source digest (no LLM, no tokens) — useful to sanity-check
```

Or directly:

```bash
bun run tools/architecture-diagram/build.ts [--full] [--no-render] [--dry]
```

| Flag | Effect |
|------|--------|
| *(none)* | Update the existing diagram if present, else full first-time generation. |
| `--full` | Regenerate the whole diagram from scratch (discards layout/manual edits). |
| `--no-render` | Write the `.drawio` but skip the draw.io SVG export. |
| `--dry` | Print the XML to stdout, write nothing. |

**Needs `ANTHROPIC_API_KEY`** — read from the environment, or from `backend/.env` (which the script
loads itself). The SVG render step needs **draw.io desktop** installed at
`/Applications/draw.io.app` (it ships a headless CLI). Without it, the `.drawio` is still written
and you can export the SVG by opening the file in draw.io.

## How it works

Two phases, on purpose:

1. **`scan.ts` — the cheap, deterministic half (no tokens).** Greps the live source for the things
   the diagram should show and emits a compact JSON digest:
   - backend routes (`backend/src/index.ts`), tools + the streamable-render set (`tools.ts`),
     LLM providers + default model (`models.ts`), the SSE event types;
   - frontend widget dirs + capability-chip titles, the `App.tsx` provider tree (in order),
     the custom hooks, and the dependency lists from both `package.json`s.

   Run `bun run diagram:scan` to see it. This is the ground truth handed to the model, so it never
   has to read the whole repo — and the diagram can't invent routes/tools that don't exist.

2. **`build.ts` — the LLM half.** Sends the digest to Claude (Sonnet, streamed):
   - **First run** (no existing `.drawio`): generate the full multi-page draw.io XML.
   - **Later runs**: send the *existing* diagram XML + the new digest and ask for an **incremental**
     edit — add cells for new things, drop cells for removed things, fix drifted labels, but keep
     stable ids and your manual layout. Then re-render the SVG via the draw.io CLI.

## Output (committed to the repo)

| File | What |
|------|------|
| `docs/diagrams/architecture.drawio` | Editable source of truth — open in draw.io. Four pages: System Overview · One Chat Turn · Frontend Internals · Backend Internals. |
| `docs/diagrams/architecture.drawio.svg` | Rendered SVG of page 1, embedded in the README + `docs/ARCHITECTURE.md`. `--embed-diagram` keeps the editable XML inside the SVG. |

## Keeping it current

When you ship a feature that changes the moving parts (a new route, tool, widget, provider), run
`bun run diagram`. The scanner picks up the change, and the incremental pass folds it into the
existing diagram without redrawing everything. Hand-tweaks you make in draw.io survive the next run
because the model is told to preserve stable ids and layout.

> Tuning: `AETHER_DIAGRAM_MODEL` overrides the model; bump `MAX_TOKENS` in `build.ts` if a large
> diagram gets truncated (you'll see a `max_tokens` warning).
