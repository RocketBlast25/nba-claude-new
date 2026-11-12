# ADR-001: Pure-core boundary

- **Status:** Accepted (2026-11-12)
- **Date:** 2026-11-12
- **Source:** `docs/architecture/architecture.md`, Architecture Principle 1 and the Module Ownership section

## Context

The game has two heavy logic areas: the background season simulation (`sim/`) and the 60 Hz Key Moment engine (`possession/`). Both must run headless so that Vitest can test them deterministically, and the 82-game speed target has to be benchmarked without a browser.

## Decision

`src/sim/` and `src/possession/` are pure TypeScript. They must not import `react`, `react-dom`, the DOM, or Canvas globals. The UI (`src/ui/`) and the Zustand adapter (`src/store/`) depend on them, never the reverse.

## Enforcement

A Vitest import-boundary test fails if any file under `src/sim` or `src/possession` imports `react`, `react-dom`, or a DOM or Canvas global. This test is planned for Milestone 2.

## Consequences

- The engine and season sim are tested in Node with no browser.
- The UI can be replaced without touching game rules.
- Rendering and input code must stay in `src/ui/`, and the engine returns plain state for it to draw.
- Adding a browser dependency to the core requires a new ADR.
