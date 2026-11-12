import { describe, expect, it } from 'vitest';
import { ATTRIBUTE_MAX, ATTRIBUTE_MIN, type Player } from '../../../src/sim/core/models';
import { SeededRng } from '../../../src/sim/core/random';
import { generateRoster } from '../../../src/sim/league/roster';
import { makeId, type TeamId } from '../../../src/sim/core/types';
import { baseChangeForAge, potentialPullFor, progressPlayer } from '../../../src/sim/career/progression';
import { CAREER_CONFIG } from '../../../src/sim/career/careerConfig';

function samplePlayer(age: number, seed = 3): Player {
  const roster = generateRoster(makeId<'team'>('T01') as TeamId, 1, new SeededRng(seed));
  return { ...roster[0]!, age };
}

describe('baseChangeForAge', () => {
  it('grows young players, holds peak players flat, and declines veterans', () => {
    const p = CAREER_CONFIG.progression;
    expect(baseChangeForAge(p.developmentMaxAge)).toBe(p.developmentBase);
    expect(baseChangeForAge(p.peakMaxAge)).toBe(p.peakBase);
    expect(baseChangeForAge(p.peakMaxAge + 1)).toBe(p.declineBase);
    expect(p.developmentBase).toBeGreaterThan(p.peakBase);
    expect(p.peakBase).toBeGreaterThan(p.declineBase);
  });
});

describe('potentialPullFor', () => {
  it('is zero at or above potential and capped when far below', () => {
    expect(potentialPullFor(70, 70)).toBe(0);
    expect(potentialPullFor(80, 70)).toBe(0);
    expect(potentialPullFor(40, 99)).toBe(CAREER_CONFIG.progression.potentialPullCap);
  });
});

describe('progressPlayer', () => {
  it('ages the player by one year and keeps attributes within bounds', () => {
    const p = samplePlayer(22);
    const next = progressPlayer(p, 50, new SeededRng(1));
    expect(next.age).toBe(23);
    for (const v of Object.values(next.attributes)) {
      expect(v).toBeGreaterThanOrEqual(ATTRIBUTE_MIN);
      expect(v).toBeLessThanOrEqual(ATTRIBUTE_MAX);
    }
  });

  it('is deterministic for the same seed and does not mutate the input', () => {
    const p = samplePlayer(27);
    const before = JSON.stringify(p);
    const a = progressPlayer(p, 60, new SeededRng(5));
    const b = progressPlayer(p, 60, new SeededRng(5));
    expect(a).toEqual(b);
    expect(JSON.stringify(p)).toBe(before);
  });

  it('gives a mood bonus only above the growth threshold', () => {
    const p = samplePlayer(27);
    const low = progressPlayer(p, 10, new SeededRng(2));
    const high = progressPlayer(p, 95, new SeededRng(2));
    const keys = Object.keys(p.attributes) as (keyof typeof p.attributes)[];
    expect(keys.some((k) => high.attributes[k] > low.attributes[k])).toBe(true);
  });
});
