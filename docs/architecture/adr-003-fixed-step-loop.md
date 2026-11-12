# ADR-003: Fixed-step 60 Hz Key Moment loop

- **Status:** Accepted (2026-11-12)
- **Date:** 2026-11-12
- **Source:** `docs/architecture/architecture.md`, API Boundaries and Data Flow sections

## Context

Key Moments are real-time 2D half-court possessions that run at 60 Hz. Their results must not depend on the frame rate of the browser, and the same seed must give the same play every time.

## Decision

The possession engine advances in fixed steps of 1/60 second. Its API is:

- `createPossession(seed, input)`
- `step(state, dtMs)`: advances by the elapsed milliseconds
- `decide(state, actionId)`: resolves a decision card

The fixed-step accumulator lives inside `possession`. Callers pass only the elapsed milliseconds. `requestAnimationFrame` timing is never used to drive game state; the UI calls `step` from its frame loop and renders the result.

The decision pause stops the clock. While a decision card is open, `step` does not advance the simulation.

## Consequences

- Results are deterministic for a given seed and sequence of decisions, regardless of frame rate.
- Tests can call `step` with fixed deltas and check exact outcomes.
- The UI must not run game logic between steps.
- Changing the step rate is a breaking change for saved Key Moment state and needs a new ADR.
