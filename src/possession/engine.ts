import { STEP_MS, type CourtEntity, type PossessionState } from './types';

/** Creates a possession at time zero with the given entities. */
export function createPossession(entities: CourtEntity[]): PossessionState {
  return {
    timeMs: 0,
    tick: 0,
    accumulatorMs: 0,
    paused: false,
    entities: entities.map((e) => ({ ...e })),
  };
}

/** Advances one fixed step. Pure: returns a new state, never mutates the input. */
function advanceOneStep(state: PossessionState): PossessionState {
  return {
    ...state,
    timeMs: state.timeMs + STEP_MS,
    tick: state.tick + 1,
    entities: state.entities.map((e) => ({
      ...e,
      x: e.x + e.vx * (STEP_MS / 1000),
      y: e.y + e.vy * (STEP_MS / 1000),
    })),
  };
}

/**
 * Advances the possession by the elapsed wall-clock milliseconds. The
 * accumulator lives here, so callers pass only dtMs (ADR-003). While paused
 * (a decision card is open) the clock does not advance.
 */
export function step(state: PossessionState, dtMs: number): PossessionState {
  if (dtMs < 0 || !Number.isFinite(dtMs)) {
    throw new RangeError('step(): dtMs must be a finite, non-negative number');
  }
  if (state.paused) {
    return state;
  }
  let next: PossessionState = { ...state, accumulatorMs: state.accumulatorMs + dtMs };
  while (next.accumulatorMs >= STEP_MS) {
    next = advanceOneStep({ ...next, accumulatorMs: next.accumulatorMs - STEP_MS });
  }
  return next;
}

/** Opens a decision pause. The clock stops until resumed. */
export function pause(state: PossessionState): PossessionState {
  return { ...state, paused: true };
}

/** Closes a decision pause. */
export function resume(state: PossessionState): PossessionState {
  return { ...state, paused: false };
}
