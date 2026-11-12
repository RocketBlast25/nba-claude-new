import { describe, expect, it } from 'vitest';
import { createPossession, pause, resume, step } from '../../../src/possession/engine';
import { STEP_MS, type CourtEntity } from '../../../src/possession/types';
import { makeId } from '../../../src/sim/core/types';

const ball: CourtEntity = { id: 'ball', teamId: null, x: 100, y: 250, vx: 60, vy: 0 };
const shooter: CourtEntity = {
  id: makeId('player'),
  teamId: makeId('team'),
  x: 200,
  y: 250,
  vx: 0,
  vy: 0,
};

describe('possession engine: fixed 60 Hz step', () => {
  it('advances in whole 1/60 s steps and keeps the remainder in the accumulator', () => {
    const start = createPossession([ball]);
    // 50 ms is 3 full steps (50 / 16.67 = 2.99...) plus a remainder.
    const next = step(start, 50);
    expect(next.tick).toBe(2);
    expect(next.timeMs).toBeCloseTo(2 * STEP_MS, 9);
    expect(next.accumulatorMs).toBeCloseTo(50 - 2 * STEP_MS, 9);
  });

  it('is deterministic: identical inputs produce identical state', () => {
    const run = () => {
      let s = createPossession([ball, shooter]);
      for (let i = 0; i < 120; i++) s = step(s, 7);
      return s;
    };
    expect(run()).toEqual(run());
  });

  it('moves entities by velocity in units per second', () => {
    let s = createPossession([ball]);
    // One second of simulated time in 60 steps.
    for (let i = 0; i < 60; i++) s = step(s, STEP_MS);
    const moved = s.entities.find((e) => e.id === 'ball');
    expect(moved?.x).toBeCloseTo(100 + 60, 6);
  });

  it('does not advance the clock while paused for a decision', () => {
    const paused = pause(createPossession([ball]));
    const after = step(paused, 1000);
    expect(after.tick).toBe(0);
    expect(after.timeMs).toBe(0);
    const resumed = step(resume(paused), 1000);
    expect(resumed.tick).toBeGreaterThan(0);
  });

  it('rejects a negative or non-finite delta', () => {
    const s = createPossession([ball]);
    expect(() => step(s, -1)).toThrow(RangeError);
    expect(() => step(s, Number.NaN)).toThrow(RangeError);
  });
});
