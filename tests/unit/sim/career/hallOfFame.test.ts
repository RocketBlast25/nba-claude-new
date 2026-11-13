import { describe, expect, it } from 'vitest';
import { buildHallOfFameEntry, canRetire, RETIREMENT_PROMPT_AGE, shouldPromptRetirement } from '../../../../src/sim/career/hallOfFame';
import type { CareerState, PlayerCareer } from '../../../../src/sim/career/types';
import type { PlayerModeState } from '../../../../src/sim/career/types';
import { emptyCareerStats } from '../../../../src/sim/career/playerMode';
import type { Player } from '../../../../src/sim/core/models';
import type { PlayerId, TeamId } from '../../../../src/sim/core/types';

const uid = 'user-1' as PlayerId;

function makePlayer(id: string, age: number): Player {
  return { id: id as PlayerId, name: `Player ${id}`, age, overall: 80 } as unknown as Player;
}

function makeCareer(opts: { age: number; retired?: boolean; mode?: boolean }): CareerState {
  const player = makePlayer('user-1', opts.age);
  const careerRow: PlayerCareer = {
    playerId: uid,
    yearsPro: 12,
    mood: 50,
    chemistry: 50,
    unsignedOffseasons: 0,
    retired: opts.retired ?? false,
    retiredSeason: null,
  };
  const mode: PlayerModeState | undefined =
    opts.mode === false
      ? undefined
      : ({
          playerId: uid,
          coachTrust: 50,
          happiness: 50,
          ambition: 50,
          trophies: [
            { kind: 'championship', season: 2030, teamId: 'T1' as TeamId },
            { kind: 'championship', season: 2031, teamId: 'T1' as TeamId },
            { kind: 'mvp', season: 2031, teamId: 'T1' as TeamId },
          ],
          careerStats: { ...emptyCareerStats(), points: 25000, gamesPlayed: 1000 },
          lifetimeEarnings: 0,
          activeObjectives: [],
          pendingOffers: [],
          unhappySeasons: 0,
        } as PlayerModeState);
  return {
    season: 2035,
    userTeamId: 'T1' as TeamId,
    players: [player],
    rosters: { T1: [uid] } as CareerState['rosters'],
    careers: [careerRow],
    events: [],
    playerMode: mode,
  } as unknown as CareerState;
}

describe('buildHallOfFameEntry', () => {
  it('locks the final career totals, trophies and retirement season', () => {
    const entry = buildHallOfFameEntry(makeCareer({ age: 38 }), uid);
    expect(entry.rings).toBe(2);
    expect(entry.mvps).toBe(1);
    expect(entry.careerStats.points).toBe(25000);
    expect(entry.retiredSeason).toBe(2035);
    expect(entry.age).toBe(38);
    expect(entry.yearsPro).toBe(12);
  });

  it('includes highlights for the rings, MVPs and career scoring', () => {
    const entry = buildHallOfFameEntry(makeCareer({ age: 38 }), uid);
    expect(entry.highlights).toContain('2 championships');
    expect(entry.highlights).toContain('1 league MVP');
    expect(entry.highlights.some((h) => h.includes('career points'))).toBe(true);
  });

  it('ranks the retired player on the all-time board with a tier', () => {
    const entry = buildHallOfFameEntry(makeCareer({ age: 38 }), uid);
    expect(entry.goatRank).toBeGreaterThanOrEqual(1);
    expect(typeof entry.tier).toBe('string');
    expect(entry.goatScore).toBeGreaterThan(0);
  });
});

describe('retirement guards', () => {
  it('prompts retirement at the prompt age and not before', () => {
    expect(shouldPromptRetirement(makeCareer({ age: RETIREMENT_PROMPT_AGE - 1 }), uid)).toBe(false);
    expect(shouldPromptRetirement(makeCareer({ age: RETIREMENT_PROMPT_AGE }), uid)).toBe(true);
  });

  it('never offers retirement to a player who already retired', () => {
    const career = makeCareer({ age: 39, retired: true });
    expect(canRetire(career, uid)).toBe(false);
    expect(shouldPromptRetirement(career, uid)).toBe(false);
  });

  it('does not allow retirement outside player mode', () => {
    expect(canRetire(makeCareer({ age: 38, mode: false }), uid)).toBe(false);
  });
});
