import { describe, expect, it } from 'vitest';
import {
  arcHeight,
  flightTime,
  laneInterceptRisk,
  PASS_PROFILE,
  RIM_RESTITUTION,
  rimBounce,
} from '../../../src/possession/ballphysics';
import { resolveRebound, type ReboundCandidate } from '../../../src/possession/rebound';

describe('3D shot and pass arc', () => {
  it('is zero at both ends of the flight', () => {
    expect(arcHeight(0, 40)).toBe(0);
    expect(arcHeight(1, 40)).toBe(0);
  });

  it('peaks at the apex at the midpoint of the flight', () => {
    expect(arcHeight(0.5, 40)).toBe(40);
    expect(arcHeight(0.25, 40)).toBeLessThan(40);
  });

  it('clamps progress outside [0, 1]', () => {
    expect(arcHeight(-1, 40)).toBe(0);
    expect(arcHeight(2, 40)).toBe(0);
  });

  it('gives lobs a much higher apex than chest passes', () => {
    expect(PASS_PROFILE.lob.apex).toBeGreaterThan(PASS_PROFILE.skip.apex);
    expect(PASS_PROFILE.skip.apex).toBeGreaterThan(PASS_PROFILE.chest.apex);
  });

  it('takes longer to cover more distance and no time at zero speed', () => {
    expect(flightTime(300, 300)).toBeGreaterThan(flightTime(100, 300));
    expect(flightTime(100, 0)).toBe(0);
  });
});

describe('pass-lane interception', () => {
  const passer = { x: 0, y: 0 };
  const receiver = { x: 200, y: 0 };

  it('is zero with no defender near the lane', () => {
    expect(laneInterceptRisk(passer, receiver, [{ x: 100, y: 200 }], 'chest')).toBe(0);
  });

  it('is higher for a defender standing on the pass line than one further off', () => {
    const onLine = laneInterceptRisk(passer, receiver, [{ x: 100, y: 0 }], 'chest');
    const offLine = laneInterceptRisk(passer, receiver, [{ x: 100, y: 15 }], 'chest');
    expect(onLine).toBeGreaterThan(offLine);
    expect(offLine).toBeGreaterThan(0);
  });

  it('uses the nearest point on the segment, not the infinite line', () => {
    // A defender beyond the receiver is far from the segment even though it sits on the line.
    expect(laneInterceptRisk(passer, receiver, [{ x: 400, y: 0 }], 'chest')).toBe(0);
  });

  it('is lower for a lob than a chest pass when the defender is at the passer end', () => {
    const defender = [{ x: 5, y: 0 }];
    const chest = laneInterceptRisk(passer, receiver, defender, 'chest');
    const lob = laneInterceptRisk(passer, receiver, defender, 'lob');
    expect(lob).toBeLessThan(chest);
  });

  it('stays within [0, 1] and is deterministic', () => {
    const defenders = [{ x: 100, y: 0 }, { x: 60, y: 10 }];
    const a = laneInterceptRisk(passer, receiver, defenders, 'skip');
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(1);
    expect(laneInterceptRisk(passer, receiver, defenders, 'skip')).toBe(a);
  });
});

describe('rim bounce', () => {
  it('reverses the vertical speed and damps it by the restitution', () => {
    const { vz, alive } = rimBounce(-200);
    expect(vz).toBeCloseTo(200 * RIM_RESTITUTION);
    expect(alive).toBe(true);
  });

  it('loses energy on each bounce until it dies', () => {
    let vz = -300;
    let bounces = 0;
    while (bounces < 50) {
      const next = rimBounce(vz);
      if (!next.alive) break;
      expect(Math.abs(next.vz)).toBeLessThan(Math.abs(vz));
      vz = next.vz;
      bounces += 1;
    }
    expect(bounces).toBeGreaterThan(0);
    expect(bounces).toBeLessThan(50);
  });

  it('is not alive for a very soft bounce', () => {
    expect(rimBounce(-20).alive).toBe(false);
  });
});

describe('rebounding', () => {
  const landing = { x: 0, y: 0 };
  const cand = (id: string, x: number, rebounding: number, offense: boolean): ReboundCandidate => ({
    id,
    pos: { x, y: 0 },
    rebounding,
    offense,
  });

  it('returns null when there is no one to win the ball', () => {
    expect(resolveRebound([], landing)).toBeNull();
  });

  it('goes to the closer player when rebounding is equal', () => {
    const r = resolveRebound([cand('far', 30, 60, false), cand('near', 5, 60, true)], landing);
    expect(r?.winnerId).toBe('near');
    expect(r?.offensive).toBe(true);
  });

  it('can go to a stronger rebounder who is slightly farther away', () => {
    const r = resolveRebound([cand('weak', 5, 30, true), cand('strong', 12, 95, false)], landing);
    expect(r?.winnerId).toBe('strong');
    expect(r?.offensive).toBe(false);
  });

  it('breaks an exact tie by lower id, deterministically', () => {
    const a = resolveRebound([cand('b', 10, 60, false), cand('a', 10, 60, true)], landing);
    const b = resolveRebound([cand('a', 10, 60, true), cand('b', 10, 60, false)], landing);
    expect(a?.winnerId).toBe('a');
    expect(b?.winnerId).toBe('a');
  });
});
