import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../../src/sim/core/random';
import { generateRoster } from '../../../src/sim/league/roster';
import { makeId, type TeamId } from '../../../src/sim/core/types';
import {
  applyCoachTrustDelta,
  clamp0to100,
  createPlayerCareerMode,
  deriveRole,
  nextUnhappySeasons,
  recordTrophy,
  shouldRequestTrade,
  updateHappiness,
  type PlayerCareerMode,
} from '../../../src/sim/career/playerMode';
import { PLAYER_MODE_CONFIG } from '../../../src/sim/career/playerModeConfig';
import type { Player } from '../../../src/sim/core/models';

function playerWithOverall(overall: number): Player {
  const base = generateRoster(makeId<'team'>('T01') as TeamId, 1, new SeededRng(7))[0]!;
  return { ...base, overall };
}

function baseMode(overrides: Partial<PlayerCareerMode> = {}): PlayerCareerMode {
  return { ...createPlayerCareerMode(playerWithOverall(70)), ...overrides };
}

const r = PLAYER_MODE_CONFIG.role;

describe('deriveRole', () => {
  it('is franchise for the top roster player at or above the overall floor', () => {
    expect(deriveRole({ rosterRank: 1, overall: r.franchiseOverall, isStarter: true })).toBe('franchise');
  });

  it('is starter for a starting player below the franchise floor', () => {
    expect(deriveRole({ rosterRank: 1, overall: r.franchiseOverall - 1, isStarter: true })).toBe('starter');
  });

  it('is sixth man for a non-starter within the sixth-man rank band', () => {
    expect(deriveRole({ rosterRank: r.sixthManMaxRank, overall: 70, isStarter: false })).toBe('sixth_man');
  });

  it('is bench for a non-starter below the sixth-man rank band', () => {
    expect(deriveRole({ rosterRank: r.sixthManMaxRank + 1, overall: 70, isStarter: false })).toBe('bench');
  });

  it('does not make a top-ranked player franchise when below the overall floor and not starting', () => {
    expect(deriveRole({ rosterRank: 1, overall: r.franchiseOverall - 1, isStarter: false })).toBe('sixth_man');
  });
});

describe('clamp0to100', () => {
  it('clamps below zero and above one hundred', () => {
    expect(clamp0to100(-5)).toBe(0);
    expect(clamp0to100(150)).toBe(100);
    expect(clamp0to100(42)).toBe(42);
  });
});

describe('createPlayerCareerMode', () => {
  it('starts with config values and ambition scaled by overall', () => {
    const mode = createPlayerCareerMode(playerWithOverall(80));
    expect(mode.coachTrust).toBe(PLAYER_MODE_CONFIG.initial.coachTrust);
    expect(mode.happiness).toBe(PLAYER_MODE_CONFIG.initial.happiness);
    expect(mode.ambition).toBe(
      PLAYER_MODE_CONFIG.initial.ambitionBase + 80 * PLAYER_MODE_CONFIG.initial.ambitionPerOverall,
    );
    expect(mode.trophies).toEqual([]);
  });

  it('keeps ambition within 0 to 100 for extreme overalls', () => {
    expect(createPlayerCareerMode(playerWithOverall(99)).ambition).toBeLessThanOrEqual(100);
  });
});

describe('applyCoachTrustDelta', () => {
  it('adds the delta and clamps at both ends', () => {
    expect(applyCoachTrustDelta(baseMode({ coachTrust: 50 }), 10).coachTrust).toBe(60);
    expect(applyCoachTrustDelta(baseMode({ coachTrust: 95 }), 20).coachTrust).toBe(100);
    expect(applyCoachTrustDelta(baseMode({ coachTrust: 5 }), -20).coachTrust).toBe(0);
  });

  it('does not mutate the input', () => {
    const mode = baseMode({ coachTrust: 50 });
    applyCoachTrustDelta(mode, 10);
    expect(mode.coachTrust).toBe(50);
  });
});

describe('updateHappiness', () => {
  it('moves happiness toward a higher target for a franchise player on a winning team', () => {
    const mode = baseMode({ happiness: 40, coachTrust: 80, ambition: 30 });
    const next = updateHappiness(mode, { role: 'franchise', teamWinPct: 0.7 });
    expect(next.happiness).toBeGreaterThan(mode.happiness);
  });

  it('moves happiness down for a bench player on a losing team', () => {
    const mode = baseMode({ happiness: 60, coachTrust: 20, ambition: 80 });
    const next = updateHappiness(mode, { role: 'bench', teamWinPct: 0.3 });
    expect(next.happiness).toBeLessThan(mode.happiness);
  });

  it('closes exactly adjustRate of the gap to the computed target', () => {
    const h = PLAYER_MODE_CONFIG.happiness;
    const mode = baseMode({ happiness: 60, coachTrust: 70, ambition: 40 });
    const next = updateHappiness(mode, { role: 'starter', teamWinPct: 0.6 });
    const successBar = (40 / 100) * h.ambitionWeight;
    const successTerm = (0.6 - 0.5 - successBar * h.successBarScale) * h.successWeight;
    const target = h.baseline + h.roleBonus.starter + (70 - 50) * h.trustWeight + successTerm;
    expect(next.happiness).toBeCloseTo(60 + (target - 60) * h.adjustRate, 6);
  });

  it('stays within 0 to 100 at the extremes', () => {
    const high = updateHappiness(baseMode({ happiness: 100, coachTrust: 100 }), { role: 'franchise', teamWinPct: 1 });
    const low = updateHappiness(baseMode({ happiness: 0, coachTrust: 0 }), { role: 'bench', teamWinPct: 0 });
    expect(high.happiness).toBeLessThanOrEqual(100);
    expect(low.happiness).toBeGreaterThanOrEqual(0);
  });
});

describe('recordTrophy', () => {
  const trophy = { kind: 'championship' as const, season: 2026, teamId: makeId<'team'>('T01') as TeamId };

  it('appends a new trophy', () => {
    expect(recordTrophy(baseMode(), trophy).trophies).toEqual([trophy]);
  });

  it('ignores a duplicate award for the same season, kind and team', () => {
    const once = recordTrophy(baseMode(), trophy);
    expect(recordTrophy(once, trophy).trophies).toHaveLength(1);
  });

  it('keeps awards of different kinds in the same season', () => {
    const mvp = { ...trophy, kind: 'mvp' as const };
    expect(recordTrophy(recordTrophy(baseMode(), trophy), mvp).trophies).toHaveLength(2);
  });
});

describe('trade-request streak', () => {
  it('counts consecutive unhappy seasons and resets after a happy one', () => {
    const t = PLAYER_MODE_CONFIG.trade.unhappyThreshold;
    let streak = nextUnhappySeasons(0, t - 1);
    expect(streak).toBe(1);
    streak = nextUnhappySeasons(streak, t - 1);
    expect(streak).toBe(2);
    expect(nextUnhappySeasons(streak, t)).toBe(0);
  });

  it('requests a trade only once the streak reaches the configured length', () => {
    const n = PLAYER_MODE_CONFIG.trade.unhappySeasonsToRequest;
    expect(shouldRequestTrade(n - 1)).toBe(false);
    expect(shouldRequestTrade(n)).toBe(true);
  });
});
