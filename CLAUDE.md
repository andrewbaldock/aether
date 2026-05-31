# CLAUDE.md — working agreements for Aether

Guidance for any AI assistant working in this repo.

## Project shape

Monorepo: `frontend/` (React 19 + Vite + Tailwind v4) and `backend/` (Bun + Hono + Anthropic +
Supabase). Runtime is **bun** — no Node, no Docker. Built incrementally, one focused change per
commit; see [docs/ROADMAP.md](docs/ROADMAP.md).

## Keep docs current (a hard rule)

`docs/STACK.md` and `docs/ARCHITECTURE.md` must stay accurate.

- **Any commit that adds, removes, or upgrades a dependency MUST update `docs/STACK.md` in the
  same commit.** No exceptions — a stale stack doc is worse than none.
- **Any commit that changes how the pieces connect** (new endpoint, new data flow, runtime/port
  change, new tool wiring) **MUST update `docs/ARCHITECTURE.md`.**
- The README's "tech stack at a glance" and run instructions must match reality too.

When you finish a change, ask: did the stack or the architecture change? If yes, the docs edit is
part of *this* commit, not a follow-up.

## The maintainer commits, not the assistant

The maintainer reviews and commits after testing each round. **Do not run `git commit`** unless
explicitly asked. Leave the working tree clean and ready; summarize what to test.

## Tooling gotchas (don't repeat)

- **Each tool has its own ignore mechanism.** `.gitignore` is git-only. Biome reads
  `biome.json` → `files.includes` (configured to skip `dist/` and `*.tsbuildinfo`). TypeScript
  reads `tsconfig.json` → `include`/`exclude`. There is no master ignore file.
- **`tsc --noEmit` ≠ `tsc -b`.** In the frontend's project-references setup, plain `tsc --noEmit`
  checks nothing (false green). The `typecheck` script uses `tsc -b --noEmit`. Verify `build`,
  not just `typecheck`, before trusting the frontend.
- **Latest-stable versions, pinned.** Biome 2.x (`check --write`, not `--apply`) and Tailwind v4
  (`@tailwindcss/vite` plugin + `@import "tailwindcss"`, no PostCSS/`tailwind.config.js`).

## Verify before claiming done

`bun run check`, `bun run typecheck`, and (frontend) `bun run build` should pass. Actually run
them; don't assume.
