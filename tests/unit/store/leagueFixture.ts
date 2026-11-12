import { SeededRng } from '../../../src/sim/core/random';
import type { Player } from '../../../src/sim/core/models';
import { makeId, type TeamId } from '../../../src/sim/core/types';
import { generateRoster } from '../../../src/sim/league/roster';
import { toSimPlayer, type SimTeam } from '../../../src/sim/background/gameSim';
import type { ScheduleTeam } from '../../../src/sim/league/schedule';
import type { CareerState, PlayerCareer } from '../../../src/sim/career/types';

const TEAM_COUNT = 30;
const ROSTER_SIZE = 14;

export type LeagueTeam = ScheduleTeam & { sim: SimTeam; roster: Player[] };

export function buildLeague(seed: number): LeagueTeam[] {
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

export function careerFrom(league: LeagueTeam[]): CareerState {
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
