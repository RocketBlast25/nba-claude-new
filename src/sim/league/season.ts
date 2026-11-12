import type { GameOutcome, StandingRow } from './standings';
import { computeStandings, sortStandings } from './standings';
import { buildSchedule, type ScheduleTeam } from './schedule';
import { simulateGame, type SimTeam } from '../background/gameSim';
import type { SeededRng } from '../core/random';
import { makeId, type GameId } from '../core/types';

export interface SeasonResult {
  gamesPlayed: number;
  standings: StandingRow[];
  outcomes: GameOutcome[];
  totalPoints: number;
  totalFgm: number;
  totalFga: number;
}

/**
 * Runs one full season: builds the schedule, simulates each game in order,
 * and returns the sorted standings. Deterministic for a given RNG seed.
 */
export function simulateSeason(
  teams: (ScheduleTeam & { sim: SimTeam })[],
  rng: SeededRng,
): SeasonResult {
  const schedule = buildSchedule(teams, rng.fork());
  const byId = new Map(teams.map((t) => [t.id, t.sim]));
  const gameRng = rng.fork();

  const outcomes: GameOutcome[] = [];
  let totalPoints = 0;
  let totalFgm = 0;
  let totalFga = 0;

  schedule.forEach((g, idx) => {
    const home = byId.get(g.homeId);
    const away = byId.get(g.awayId);
    if (!home || !away) throw new Error('simulateSeason: schedule references an unknown team');
    const result = simulateGame(makeId<'game'>(`g${idx + 1}`) as GameId, home, away, gameRng);
    outcomes.push({ homeId: g.homeId, awayId: g.awayId, homeWon: result.home.points > result.away.points });
    totalPoints += result.home.points + result.away.points;
    totalFgm += result.home.fgm + result.away.fgm;
    totalFga += result.home.fga + result.away.fga;
  });

  const standings = sortStandings(computeStandings(teams, outcomes), outcomes);
  return { gamesPlayed: outcomes.length, standings, outcomes, totalPoints, totalFgm, totalFga };
}
