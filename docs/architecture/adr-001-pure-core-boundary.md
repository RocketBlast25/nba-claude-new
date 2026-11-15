# ADR-001: Pure-core boundary

- **Status:** Accepted (2026-11-12)
- **Date:** 2026-11-12
- **Source:** `docs/architecture/architecture.md`, Architecture Principle 1 and the Module Ownership section

## Context

The game has two heavy logic areas: the background season simulation (`sim/`) and the 60 Hz Key Moment engine (`possession/`). Both must run headless so that Vitest can test them deterministically, and the 82-game speed target has to be benchmarked without a browser.

## Decision

`src/sim/` and `src/possession/` are pure TypeScript. They must not import `react`, `react-dom`, the DOM, or Canvas globals. The UI (`src/ui/`) and the Zustand adapter (`src/store/`) depend on them, never the reverse.

## Enforcement

The Vitest import-boundary test in `tests/unit/architecture/import-boundary.test.ts` enforces the boundary:

- `src/sim`, `src/sim/career`, `src/sim/season`, and `src/possession` must not import `react` or `react-dom`, and must not reference DOM, Canvas, browser storage (`indexedDB`, `localStorage`, `sessionStorage`), or animation (`requestAnimationFrame`, `cancelAnimationFrame`) globals.
- `src/persistence` is the one layer allowed to use browser storage, so it is checked only for React and `react-dom` imports.

The check is a line scan of the source text, with `//` line comments ignored. It does not follow transitive imports, so a forbidden global reached through a helper outside these directories is not caught.

## Consequences

- The engine and season sim are tested in Node with no browser.
- The UI can be replaced without touching game rules.
- Rendering and input code must stay in `src/ui/`, and the engine returns plain state for it to draw.
- Adding a browser dependency to the core requires a new ADR.
