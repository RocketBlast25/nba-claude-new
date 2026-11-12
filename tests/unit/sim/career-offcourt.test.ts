import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../../src/sim/core/random';
import { generateRoster } from '../../../src/sim/league/roster';
import { makeId, type TeamId } from '../../../src/sim/core/types';
import { applyEvent, moodSalaryModifier, rollOffCourtEvent } from '../../../src/sim/career/offCourt';
import { CAREER_CONFIG } from '../../../src/sim/career/careerConfig';
import type { OffCourtEvent } from '../../../src/sim/career/types';

const player = generateRoster(makeId<'team'>('T01') as TeamId, 1, new SeededRng(7))[0]!;
const max = CAREER_CONFIG.offCourt.maxEffect;

describe('rollOffCourtEvent', () => {
  it('keeps mood and chemistry effects within the configured maximum', () => {
    const rng = new SeededRng(11);
    for (let s = 0; s < 500; s++) {
      const e = rollOffCourtEvent(player, 1, rng);
      if (!e) continue;
      expect(Math.abs(e.moodDelta)).toBeLessThanOrEqual(max);
      expect(Math.abs(e.chemistryDelta)).toBeLessThanOrEqual(max);
    }
  });

  it('fires at roughly the configured event rate', () => {
    const rng = new SeededRng(21);
    let fired = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) if (rollOffCourtEvent(player, 1, rng)) fired++;
    const rate = fired / trials;
    expect(rate).toBeGreaterThan(CAREER_CONFIG.offCourt.eventRate - 0.05);
    expect(rate).toBeLessThan(CAREER_CONFIG.offCourt.eventRate + 0.05);
  });

  it('is deterministic for the same seed', () => {
    const a = rollOffCourtEvent(player, 2, new SeededRng(3));
    const b = rollOffCourtEvent(player, 2, new SeededRng(3));
    expect(a).toEqual(b);
  });
});

describe('applyEvent', () => {
  it('clamps mood and chemistry to 0-100', () => {
    const up: OffCourtEvent = { id: 'x', kind: 'media', playerId: player.id, season: 1, moodDelta: 50, chemistryDelta: 50 };
    const down: OffCourtEvent = { ...up, moodDelta: -50, chemistryDelta: -50 };
    expect(applyEvent(90, 90, up)).toEqual({ mood: 100, chemistry: 100 });
    expect(applyEvent(10, 10, down)).toEqual({ mood: 0, chemistry: 0 });
  });
});

describe('moodSalaryModifier', () => {
  it('is neutral at mood 50 and bounded by the configured maximum', () => {
    expect(moodSalaryModifier(50)).toBeCloseTo(1, 10);
    const m = CAREER_CONFIG.offCourt.maxSalaryModifier;
    expect(moodSalaryModifier(0)).toBeCloseTo(1 + m, 10);
    expect(moodSalaryModifier(100)).toBeCloseTo(1 - m, 10);
  });
});
