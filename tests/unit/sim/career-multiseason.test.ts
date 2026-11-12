import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../../src/sim/core/random';
import type { Player } from '../../../src/sim/core/models';
import { makeId, type TeamId } from '../../../src/sim/core/types';
import { generateRoster } from '../../../src/sim/league/roster';
import { simulateSeason } from '../../../src/sim/league/season';
import { toSimPlayer, type SimTeam } from '../../../src/sim/background/gameSim';
import type { ScheduleTeam } from '../../../src/sim/league/schedule';
import { LEAGUE_CONFIG } from '../../../src/sim/league/leagueConfig';
import { advanceCareerOffseason } from '../../../src/sim/career/careerLoop';
import type { CareerState, PlayerCareer } from '../../../src/sim/career/types';

const TEAM_COUNT = 30;
const ROSTER_SIZE = 14;
const SEASONS = 3;

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

function runCareer(seed: number): { seasons: number; rosterSizes: number[]; finalJson: string; ms: number } {
  const started = performance.now();
  const rng = new SeededRng(seed);
  const league = buildLeague(rng.fork());
  const userTeamId = league[0]!.id;
  let state: CareerState = {
    season: 1,
    userTeamId,
    players: league.flatMap((t) => t.roster),
    careers: league.flatMap((t) => t.roster).map(
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
  const rosterSizes: number[] = [];
  const careerRng = rng.fork();

  for (let s = 0; s < SEASONS; s++) {
    // Each season uses the current players as the league's rosters.
    const teams = league.map((t) => ({
      ...t,
      sim: { ...t.sim, players: state.players.filter((p) => t.roster.some((r) => r.id === p.id)).map(toSimPlayer) },
    }));
    const season = simulateSeason(teams, rng.fork());
    expect(season.standings.length).toBe(TEAM_COUNT);
    const offseason = advanceCareerOffseason(state, careerRng);
    state = offseason.state;
    rosterSizes.push(state.players.length);
  }
  return {
    seasons: state.season - 1,
    rosterSizes,
    finalJson: JSON.stringify(state),
    ms: performance.now() - started,
  };
}

describe('multi-season career (3 seasons, real simulation)', () => {
  it('runs three seasons with a valid, non-growing league and is deterministic', () => {
    const a = runCareer(2026);
    const b = runCareer(2026);
    expect(a.seasons).toBe(SEASONS);
    expect(a.finalJson).toBe(b.finalJson);
    // Without replacement signings the player pool only shrinks as players retire.
    for (let i = 1; i < a.rosterSizes.length; i++) {
      expect(a.rosterSizes[i]).toBeLessThanOrEqual(a.rosterSizes[i - 1]!);
    }
    expect(a.rosterSizes[0]).toBeLessThanOrEqual(TEAM_COUNT * ROSTER_SIZE);
    expect(LEAGUE_CONFIG.maxRosterSize).toBeGreaterThanOrEqual(ROSTER_SIZE);
    // Timing is reported so it can be read from the test log.
    console.log(`career 3-season run: ${a.ms.toFixed(0)} ms (seed 2026)`);
  }, 30_000);
});
