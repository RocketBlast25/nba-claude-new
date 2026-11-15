# Spike: tick-based tactical possession engine

Date: 2026-11-15

## Question

Can a continuous, tick-based possession engine with deterministic seeded setup produce
realistic offensive movement (spacing sets, screens, dribble vs. sprint, acceleration limits)
and man-to-man defenders that stay goal-side and contest shots by distance, closing speed
and angle at release?

## What was built (in src/possession/, not in this folder)

- `defense.ts`: goal-side spot, ball-screen hedge, drive help, and `shotContest` (proximity,
  closing speed, and angle to the shot line, clamped to [0, 1]).
- `tactics.ts`: `stepTactics`, a pure fixed-step (STEP_MS) stepper. Offense takes spacing
  roles (five-out, four-out-one-in, horns, pick-and-roll); the handler dribbles at 120 u/s
  and sprints at 230 u/s when a defender is close; velocity is limited by an ACCEL cap.
- `keyMomentCourt.ts`: `choreograph` now samples 8 frames of `stepTactics` output instead of
  eased keyframes. The public API (`runKeyMomentCourt`, `arcPoint`, `ease`, `RELEASE_FRAME`,
  `attackingHoop`) is unchanged. The outcome still comes from `decide()` on the same RNG.

## Verified

- `npx tsc --noEmit`: exit 0.
- `npx vitest run tests/unit/possession tests/unit/sim/keyMomentCourt.test.ts`: 43/43 passed.
  New tests in `tests/unit/possession/tactics.test.ts` cover goal-side geometry, hedge and help
  factors, contest scaling with distance, closing speed and angle, the step's non-mutation and
  determinism, the ACCEL cap, and the dribble speed cap.
- One bug was found by a test and fixed: the closing-speed projection had the wrong sign, so
  closing defenders contributed nothing.

## Not verified (limits of this spike)

- Passing lanes, interceptions, shot arc height and rebounds are not modelled yet (Milestone 2).
- Full-game and phase-b regression suites were not rerun after the engine change; only
  `keyMomentCourt` and possession tests were run.
- The renderer still draws 8 frames with the existing `CourtReplay` and was not visually checked.
- Defenders use a simple per-index assignment, not a switching matchup or real screen detection.

## Decision

The tactical stepper behaves as designed in unit tests, so Milestone 2 can build on it.
