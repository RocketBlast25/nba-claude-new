import { describe, expect, it } from 'vitest';
import {
  arcPoint,
  buildKeyMomentCourt,
  ease,
  runKeyMomentCourt,
  type KeyMomentCourtInput,
} from '../../../src/possession/keyMomentCourt';
import { ACTION_IDS } from '../../../src/possession/decision';
import { SeededRng } from '../../../src/sim/core/random';
import type { Attributes, Player } from '../../../src/sim/core/models';
import type { PlayerId, TeamId } from '../../../src/sim/core/types';

function attrs(v: number): Attributes {
  return new Proxy({} as Attributes, { get: () => v });
}

function player(id: string, v = 70): Player {
  return { id, name: id, attributes: attrs(v) } as unknown as Player;
}

function input(seed: number, actionId: KeyMomentCourtInput['actionId']): KeyMomentCourtInput {
  return {
    actor: player('p-user', 80),
    offense: ['m1', 'm2', 'm3', 'm4'].map((id) => player(id)),
    defense: ['d1', 'd2', 'd3', 'd4', 'd5'].map((id) => player(id)),
    offenseTeamId: 'team-user' as TeamId,
    defenseTeamId: 'team-opp' as TeamId,
    actionId,
    seed,
  };
}

describe('ball height and rebound on the court', () => {
  it('gives the ball a height that rises on the shot arc and returns to the floor', () => {
    const run = runKeyMomentCourt(input(17, 'drive'));
    const zs = run.frames.map((f) => f.ballPos.z ?? 0);
    // The ball is airborne after release: some frame is above the floor.
    expect(Math.max(...zs)).toBeGreaterThan(0);
    // The arc rises then falls: the peak is not on the last frame.
    const peak = zs.indexOf(Math.max(...zs));
    expect(peak).toBeLessThan(zs.length - 1);
    expect(zs[zs.length - 1]).toBeLessThan(Math.max(...zs));
  });

  it('names a rebound winner from the players on the court, or none', () => {
    const run = runKeyMomentCourt(input(17, 'drive'));
    const ids = new Set(run.frames[0]!.players.map((p) => p.id));
    if (run.reboundWinnerId !== null) expect(ids.has(run.reboundWinnerId)).toBe(true);
  });
});

describe('court easing bounds', () => {
  it('pins the endpoints and midpoint of smoothstep', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBe(0.5);
  });

  it('clamps t below 0 to 0 instead of overshooting', () => {
    expect(ease(-1)).toBe(0);
    expect(ease(-0.0001)).toBe(0);
  });

  it('clamps t above 1 to 1 instead of overshooting', () => {
    expect(ease(2)).toBe(1);
    expect(ease(1.0001)).toBe(1);
  });

  it('stays within [0, 1] across a dense sweep', () => {
    for (let t = -2; t <= 3; t += 0.05) {
      const v = ease(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('zero-duration arc segments', () => {
  it('returns the start point when from and to coincide', () => {
    const p = { x: 120, y: 80 };
    for (const u of [0, 0.5, 1]) {
      const at = arcPoint(p, p, u);
      expect(at.x).toBe(120);
      expect(at.y).toBe(80);
    }
  });

  it('stays finite for a zero-length segment (no NaN from the normal)', () => {
    const p = { x: 300, y: 200 };
    const at = arcPoint(p, p, 0.5);
    expect(Number.isFinite(at.x)).toBe(true);
    expect(Number.isFinite(at.y)).toBe(true);
  });

  it('hits the endpoints exactly at u = 0 and u = 1', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 0 };
    // The bulge is sin(pi * u), which is ~1e-15 (not exactly 0) at u = 1, so compare with a tolerance.
    const start = arcPoint(a, b, 0);
    const end = arcPoint(a, b, 1);
    expect(start.x).toBeCloseTo(0, 9);
    expect(start.y).toBeCloseTo(0, 9);
    expect(end.x).toBeCloseTo(100, 9);
    expect(end.y).toBeCloseTo(0, 9);
  });
});

describe('live Key Moment court run', () => {
  it('produces identical frames and outcome for the same moment and seed', () => {
    const a = runKeyMomentCourt(input(42, 'drive'));
    const b = runKeyMomentCourt(input(42, 'drive'));
    expect(JSON.stringify(a.frames)).toBe(JSON.stringify(b.frames));
    expect(a.outcome).toEqual(b.outcome);
  });

  it('changes the play when the seed changes', () => {
    const a = runKeyMomentCourt(input(1, 'pass'));
    const b = runKeyMomentCourt(input(2, 'pass'));
    expect(JSON.stringify(a.frames)).not.toBe(JSON.stringify(b.frames));
  });

  it('places five offense and five defense players on the court', () => {
    const run = runKeyMomentCourt(input(7, 'pull_up'));
    expect(run.frames).toHaveLength(8);
    expect(run.offenseIds).toEqual(['p-user', 'm1', 'm2', 'm3', 'm4'] as PlayerId[]);
    expect(run.defenseIds).toEqual(['d1', 'd2', 'd3', 'd4', 'd5'] as PlayerId[]);
    const ids = run.frames[0]!.players.map((p) => p.id).sort();
    expect(ids).toEqual([...run.offenseIds, ...run.defenseIds].sort());
  });

  it('builds the same setup from the seed so frames and outcome share one run', () => {
    const seed = 3;
    const rng = new SeededRng(seed);
    const setup = buildKeyMomentCourt(input(seed, 'drive'), rng);
    expect(setup.filter((e) => e.teamId === 'team-user')).toHaveLength(5);
    expect(setup.filter((e) => e.teamId === 'team-opp')).toHaveLength(5);
  });

  it('derives the outcome from the play, reproducibly for the same seed', () => {
    for (const actionId of ACTION_IDS) {
      for (const seed of [3, 17, 99]) {
        const run = runKeyMomentCourt(input(seed, actionId));
        // The same seed always resolves to the same play and outcome.
        expect(runKeyMomentCourt(input(seed, actionId)).outcome).toEqual(run.outcome);
        // The outcome records the actor's ratings-based chance, adjusted by the play.
        expect(run.outcome.successChance).toBeGreaterThanOrEqual(0);
        expect(run.outcome.successChance).toBeLessThanOrEqual(1);
        expect(run.outcome.actionId).toBe(actionId);
      }
    }
  });
});
