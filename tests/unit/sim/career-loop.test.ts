import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../../src/sim/core/random';
import { generateRoster } from '../../../src/sim/league/roster';
import { makeId, type TeamId } from '../../../src/sim/core/types';
import { advanceCareerOffseason } from '../../../src/sim/career/careerLoop';
import type { CareerState, PlayerCareer } from '../../../src/sim/career/types';

function buildState(seed: number): CareerState {
  const userTeamId = makeId<'team'>('T01') as TeamId;
  const players = generateRoster(userTeamId, 1, new SeededRng(seed));
  const careers: PlayerCareer[] = players.map((p) => ({
    playerId: p.id,
    yearsPro: 0,
    mood: 50,
    chemistry: 50,
    unsignedOffseasons: 0,
    retired: false,
    retiredSeason: null,
  }));
  const rosters = { [userTeamId]: players.map((p) => p.id) } as CareerState['rosters'];
  return { season: 1, userTeamId, players, rosters, careers, events: [] };
}

describe('advanceCareerOffseason', () => {
  it('advances the season and ages every surviving player by one year', () => {
    const state = buildState(1);
    const { state: next } = advanceCareerOffseason(state, new SeededRng(2));
    expect(next.season).toBe(2);
    for (const p of next.players) {
      const before = state.players.find((x) => x.id === p.id)!;
      expect(p.age).toBe(before.age + 1);
    }
  });

  it('does not mutate the input state', () => {
    const state = buildState(1);
    const before = JSON.stringify(state);
    advanceCareerOffseason(state, new SeededRng(2));
    expect(JSON.stringify(state)).toBe(before);
  });

  it('removes retirees from players and marks them retired in careers', () => {
    const state = buildState(1);
    // Force retirement: make every player a veteran who is past the forced age.
    const forced: CareerState = {
      ...state,
      players: state.players.map((p) => ({ ...p, age: 40 })),
    };
    const { state: next, retired } = advanceCareerOffseason(forced, new SeededRng(4));
    expect(retired.length).toBe(forced.players.length);
    expect(next.players).toHaveLength(0);
    expect(next.careers.every((c) => c.retired)).toBe(true);
  });

  it('is deterministic across three seasons with the same seed', () => {
    const run = (seed: number): string => {
      let s = buildState(seed);
      const rng = new SeededRng(seed + 100);
      for (let i = 0; i < 3; i++) s = advanceCareerOffseason(s, rng).state;
      return JSON.stringify(s);
    };
    expect(run(7)).toBe(run(7));
  });
});
