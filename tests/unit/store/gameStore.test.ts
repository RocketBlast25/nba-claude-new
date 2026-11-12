import { describe, expect, it, beforeEach } from 'vitest';
import { SeededRng } from '../../../src/sim/core/random';
import type { Player } from '../../../src/sim/core/models';
import { makeId, type TeamId } from '../../../src/sim/core/types';
import { generateRoster } from '../../../src/sim/league/roster';
import { toSimPlayer, type SimTeam } from '../../../src/sim/background/gameSim';
import type { ScheduleTeam } from '../../../src/sim/league/schedule';
import type { CareerState, PlayerCareer } from '../../../src/sim/career/types';
import { useGameStore, drawUserMoments } from '../../../src/store/gameStore';

const TEAM_COUNT = 30;
const ROSTER_SIZE = 14;

type LeagueTeam = ScheduleTeam & { sim: SimTeam; roster: Player[] };

function buildLeague(seed: number): LeagueTeam[] {
  const rng = new SeededRng(seed);
  const teams: LeagueTeam[] = [];
  for (let i = 0; i < TEAM_COUNT; i++) {
    const id = makeId<'team'>(`T${String(i).padStart(2, '0')}`) as TeamId;
    const roster = generateRoster(id, ROSTER_SIZE, rng.fork());
    const sim: SimTeam = { id, pace: 100, offRating: 110, defRating: 110, players: roster.map(toSimPlayer) };
    teams.push({
      id,
      conference: i < 15 ? 'East' : 'West',
      division: i < 15 ? (i < 5 ? 'Atlantic' : i < 10 ? 'Central' : 'Southeast') : i < 20 ? 'Northwest' : 'Pacific',
      sim,
      roster,
    });
  }
  return teams;
}

function careerFrom(league: LeagueTeam[]): CareerState {
  const allPlayers = league.flatMap((t) => t.roster);
  return {
    season: 1,
    userTeamId: league[0]!.id,
    players: allPlayers,
    rosters: Object.fromEntries(league.map((t) => [t.id, t.roster.map((p) => p.id)])) as CareerState['rosters'],
    careers: allPlayers.map(
      (p): PlayerCareer => ({
        playerId: p.id,
        yearsPro: 0,
        mood: 50,
        chemistry: 50,
        unsignedOffseasons: 0,
        retired: false,
        retiredSeason: null,
      }),
    ),
    events: [],
  };
}

function startedStore(seed = 42) {
  const league = buildLeague(seed);
  const career = careerFrom(league);
  useGameStore.getState().startCareer({ career, userTeamId: career.userTeamId, seed, leagueTeams: league });
  return { league, career };
}

describe('gameStore', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('starts in the regular season with no pending moments', () => {
    const { career } = startedStore();
    const s = useGameStore.getState();
    expect(s.phase).toBe('regular_season');
    expect(s.userTeamId).toBe(career.userTeamId);
    expect(s.pendingMoments).toEqual([]);
  });

  it('plays a season and moves to playoffs with a bracket', () => {
    const { league } = startedStore();
    useGameStore.getState().playSeason(league);
    const s = useGameStore.getState();
    expect(s.phase).toBe('playoffs');
    expect(s.season?.standings.length).toBe(TEAM_COUNT);
    expect(s.playoffs?.champion).toBeDefined();
    expect(s.playoffs?.rounds.length).toBeGreaterThan(0);
  });

  it('resolves the front Key Moment and removes it from the queue', () => {
    const { career } = startedStore();
    const moments = drawUserMoments(career, 'g1', 7);
    useGameStore.getState().queueMoments(moments);
    const before = useGameStore.getState().pendingMoments.length;
    expect(before).toBeGreaterThan(0);
    const result = useGameStore.getState().resolveNextMoment('drive');
    expect(result).not.toBeNull();
    const s = useGameStore.getState();
    expect(s.pendingMoments.length).toBe(before - 1);
    expect(s.resolvedMoments.at(-1)?.actionId).toBe('drive');
  });

  it('returns null when resolving with an empty queue', () => {
    expect(useGameStore.getState().resolveNextMoment('pass')).toBeNull();
  });

  it('runs the offseason, advances the season and sets a 30-pick draft board', () => {
    const { league, career } = startedStore();
    useGameStore.getState().playSeason(league);
    useGameStore.getState().runOffseason();
    const s = useGameStore.getState();
    expect(s.phase).toBe('offseason');
    expect(s.career?.season).toBe(career.season + 1);
    expect(s.draftOrder.length).toBe(TEAM_COUNT);
    expect(s.draftOrder.map((p) => p.pick)).toEqual(Array.from({ length: TEAM_COUNT }, (_, i) => i + 1));
  });

  it('refuses the offseason before the season is played', () => {
    startedStore();
    expect(() => useGameStore.getState().runOffseason()).toThrow(/season and playoffs/);
  });
});
