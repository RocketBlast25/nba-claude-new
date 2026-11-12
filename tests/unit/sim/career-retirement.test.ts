import { describe, expect, it } from 'vitest';
import type { Player } from '../../../src/sim/core/models';
import { SeededRng } from '../../../src/sim/core/random';
import { generateRoster } from '../../../src/sim/league/roster';
import { makeId, type TeamId } from '../../../src/sim/core/types';
import { retirementReason } from '../../../src/sim/career/retirement';
import { CAREER_CONFIG } from '../../../src/sim/career/careerConfig';

function playerAt(age: number, overall: number): Player {
  const base = generateRoster(makeId<'team'>('T01') as TeamId, 1, new SeededRng(4))[0]!;
  return { ...base, age, overall };
}

const r = CAREER_CONFIG.retirement;

describe('retirementReason', () => {
  it('always retires at the forced age, regardless of overall', () => {
    expect(retirementReason(playerAt(r.forcedAge, 90), 0, new SeededRng(1))).toBe('forced_age');
  });

  it('never retires a young, healthy player', () => {
    expect(retirementReason(playerAt(24, 70), 0, new SeededRng(1))).toBeNull();
  });

  it('applies the low-overall band only at its age and below the floor', () => {
    let hits = 0;
    for (let s = 0; s < 200; s++) {
      if (retirementReason(playerAt(r.lowOverallAge, r.lowOverallFloor - 1), 0, new SeededRng(s))) hits++;
    }
    // Roughly the configured chance, with a generous tolerance for 200 trials.
    expect(hits / 200).toBeGreaterThan(r.lowOverallChance - 0.15);
    expect(hits / 200).toBeLessThan(r.lowOverallChance + 0.15);
    expect(retirementReason(playerAt(r.lowOverallAge, r.lowOverallFloor), 0, new SeededRng(1))).toBeNull();
  });

  it('retires a veteran only after enough consecutive unsigned offseasons', () => {
    const vet = playerAt(r.unsignedVeteranAge, 65);
    expect(retirementReason(vet, r.unsignedOffseasonsToRetire - 1, new SeededRng(1))).toBeNull();
    expect(retirementReason(vet, r.unsignedOffseasonsToRetire, new SeededRng(1))).toBe('unsigned_veteran');
  });

  it('does not count unsigned seasons for players under the veteran age', () => {
    const young = playerAt(r.unsignedVeteranAge - 1, 65);
    expect(retirementReason(young, 99, new SeededRng(1))).toBeNull();
  });
});
