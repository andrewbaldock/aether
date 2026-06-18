# Plan 007: One-command repo verify

> **Executor instructions**: Follow step by step; run every verify command. On any STOP condition,
> stop and report. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 476d17e..HEAD -- package.json README.md`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `476d17e`, 2026-06-18

## Why this matters

There is no single command to verify the whole repo. The root `package.json` holds only the diagram
scripts; a contributor must `cd backend && bun run verify` *and* `cd frontend && bun run build`
separately and remember the order. CI is the only place all layers run together, so the feedback
loop for "did I break anything" is a push away. A root `verify` script that chains both packages
makes the pre-push check obvious and one command.

## Current state

- Root `package.json`:
  ```json
  {
    "name": "aether", "private": true, "license": "MIT",
    "//": "Root holds repo-level tooling only. frontend/ and backend/ are still installed and run independently (no workspaces here yet).",
    "scripts": {
      "diagram": "bun run tools/architecture-diagram/build.ts",
      "diagram:full": "bun run tools/architecture-diagram/build.ts --full",
      "diagram:scan": "bun run tools/architecture-diagram/scan.ts"
    }
  }
  ```
- `backend/package.json` has `"verify": "bun run typecheck && bun test"` and `"check": "biome check ."`.
- `frontend/package.json` has `"build": "vitest run && tsc -b && vite build"`, `"typecheck":
  "tsc -b --noEmit"`, `"check": "biome check ."`. **Note**: the frontend's real gate is `build`
  (the project-references `tsc -b --noEmit` typecheck can false-green — see `CLAUDE.md`).
- `README.md` documents per-package checks, not a root one.

### Conventions to follow

- **Runtime is bun.** Use `bun run` / `bunx`, never npm/node.
- Keep the existing root `"//"` comment (it explains the no-workspace choice).
- Cross-package chaining must work on macOS bash (the maintainer's shell). Avoid `cd` chains that
  leave the shell in the wrong dir; use subshells or `--cwd`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| The new root verify | `bun run verify` (from repo root) | runs both packages; exit 0 |
| The new root check | `bun run check` (from repo root) | lints both; exit 0 |

## Scope

**In scope**:
- Root `package.json` — add `verify` and `check` (and optionally `verify:frontend`/`verify:backend`).
- `README.md` — document `bun run verify` as the pre-push check.

**Out of scope**:
- Adding a bun workspace — explicitly rejected.
- CI changes — `.github/workflows/ci.yml` already runs the layers as separate jobs; leave it. (A
  later plan could point CI at the root script, but not here — keep this S and risk-free.)
- The per-package scripts — unchanged.

## Git workflow

- Branch: `advisor/007-root-verify`. Do NOT push or commit.

## Steps

### Step 1: Add the root scripts

Use subshells so each runs in its own package dir and a failure short-circuits:
```json
"scripts": {
  "diagram": "bun run tools/architecture-diagram/build.ts",
  "diagram:full": "bun run tools/architecture-diagram/build.ts --full",
  "diagram:scan": "bun run tools/architecture-diagram/scan.ts",
  "verify:backend": "(cd backend && bun run verify)",
  "verify:frontend": "(cd frontend && bun run build)",
  "verify": "bun run verify:backend && bun run verify:frontend",
  "check": "(cd backend && bun run check) && (cd frontend && bun run check)"
}
```
(Frontend's `build` is intentionally the gate, not `typecheck` — it's the only thing that catches the
project-references false-green.)

**Verify**: `bun run verify` from the repo root → both packages run; exit 0. `bun run check` → exit 0.

### Step 2: Document it

In `README.md`, under the existing checks/verification section, add: "**Before pushing**, run
`bun run verify` from the repo root — it typechecks + tests the backend and builds + tests the
frontend in one command." Note that the frontend uses `build` (not just `typecheck`) because the
project-references typecheck can false-green.

**Verify**: `grep -n "bun run verify" README.md` → at least one match.

## Test plan

- No code tests. The script *is* the test: running `bun run verify` from root must exercise both
  packages' suites and exit 0 on a clean tree.

## Done criteria

- [ ] `bun run verify` from the repo root runs backend verify + frontend build and exits 0
- [ ] `bun run check` from the repo root lints both packages and exits 0
- [ ] `README.md` documents `bun run verify` as the pre-push check
- [ ] The root `"//"` no-workspace comment is preserved
- [ ] `git status` shows only `package.json` + `README.md` changed
- [ ] `plans/README.md` row updated

## STOP conditions

- The subshell `(cd … && …)` pattern fails on the maintainer's bash (e.g. a script-not-found) and you
  can't make a portable equivalent — report it.
- `bun run verify` surfaces a *pre-existing* failure in either package (not caused by this change) —
  STOP and report the failure; do not "fix" unrelated code to make the script green.

## Maintenance notes

- If a third package is ever added, extend `verify` with another subshell.
- A later, separate change could make CI call `bun run verify` to keep local and CI in lockstep — left
  out here deliberately to keep this risk-free.
