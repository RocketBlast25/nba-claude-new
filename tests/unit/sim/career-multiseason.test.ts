import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../../src/sim/core/random';
import type { Player } from '../../../src/sim/core/models';
import { makeId, type TeamId } from '../../../src/sim/core/types';
import { generateRoster } from '../../../src/sim/league/roster';
import { simulateSeason } from '../../../src/sim/league/season';
import { toSimPlayer, type SimTeam } from '../../../src/sim/background/gameSim';
import type { ScheduleTeam } from '../../../src/sim/league/schedule';
import { LEAGUE_CONFIG } from '../../../src/sim/league/leagueConfig';
import { advanceCareerOffseason, runOffseasonEconomy, ROSTER_FLOOR } from '../../../src/sim/career/careerLoop';
import type { CareerState, PlayerCareer } from '../../../src/sim/career/types';

const TEAM_COUNT = 30;
const ROSTER_SIZE = 14;
const SEASONS = 3;
const PLAYOFF_TEAMS = 16;

function buildLeague(rng: SeededRng) {
  const teams: (ScheduleTeam & { sim: SimTeam; roster: Player[] })[] = [];
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

interface CareerRun {
  rosterSizes: number[][];
  finalJson: string;
  ms: number;
}

function runCareer(seed: number): CareerRun {
  const started = performance.now();
  const rng = new SeededRng(seed);
  const league = buildLeague(rng.fork());
  const userTeamId = league[0]!.id;
  const allPlayers = league.flatMap((t) => t.roster);
  const rosters = Object.fromEntries(league.map((t) => [t.id, t.roster.map((p) => p.id)])) as CareerState['rosters'];
  let state: CareerState = {
    season: 1,
    userTeamId,
    players: allPlayers,
    rosters,
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
  const rosterSizes: number[][] = [];
  const careerRng = rng.fork();

  for (let s = 0; s < SEASONS; s++) {
    // Simulate with each team's current roster.
    const byId = new Map(state.players.map((p) => [p.id, p]));
    const teams = league.map((t) => ({
      ...t,
      sim: { ...t.sim, players: state.rosters[t.id]!.map((id) => toSimPlayer(byId.get(id)!)) },
    }));
    const season = simulateSeason(teams, rng.fork());
    expect(season.standings.length).toBe(TEAM_COUNT);

    // Playoff field is the top of the standings; exit order is the reverse seeding,
    // so the best playoff team exits last.
    const ranked = season.standings.map((r) => r.teamId);
    const playoffTeams = ranked.slice(0, PLAYOFF_TEAMS);
    const playoffExitOrder = [...playoffTeams].reverse();

    const offseason = advanceCareerOffseason(state, careerRng);
    state = runOffseasonEconomy(offseason.state, season.standings, playoffTeams, playoffExitOrder, careerRng);
    rosterSizes.push(league.map((t) => state.rosters[t.id]!.length));
  }
  return {
    rosterSizes,
    finalJson: JSON.stringify(state),
    ms: performance.now() - started,
  };
}

describe('multi-season career (3 seasons, real simulation)', () => {
  it('replenishes every roster within the floor and the 15-player cap across seasons, and is deterministic', () => {
    const a = runCareer(2026);
    const b = runCareer(2026);
    expect(a.finalJson).toBe(b.finalJson);
    expect(a.rosterSizes.length).toBe(SEASONS);
    expect(LEAGUE_CONFIG.maxRosterSize).toBe(15);
    for (const sizes of a.rosterSizes) {
      for (const size of sizes) {
        expect(size).toBeGreaterThanOrEqual(ROSTER_FLOOR);
        expect(size).toBeLessThanOrEqual(LEAGUE_CONFIG.maxRosterSize);
      }
    }
    // Timing is reported so it can be read from the test log.
    console.log(`career 3-season run: ${a.ms.toFixed(0)} ms (seed 2026)`);
  }, 30_000);
});
