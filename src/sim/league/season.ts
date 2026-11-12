import type { GameOutcome, StandingRow } from './standings';
import { computeStandings, sortStandings } from './standings';
import { buildSchedule, type ScheduleTeam } from './schedule';
import { simulateGame, type SimTeam } from '../background/gameSim';
import type { SeededRng } from '../core/random';
import { makeId, type GameId } from '../core/types';
import type { GameBoxScore } from '../core/models';
import { aggregatePlayerSeasons, type PlayerSeasonLine } from './playerSeason';

export interface SeasonResult {
  gamesPlayed: number;
  standings: StandingRow[];
  outcomes: GameOutcome[];
  totalPoints: number;
  totalFgm: number;
  totalFga: number;
  /** Per-player season totals and per-game averages (Milestone 5, Item 4). */
  playerSeasons: PlayerSeasonLine[];
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
  const boxScores: GameBoxScore[] = [];

  schedule.forEach((g, idx) => {
    const home = byId.get(g.homeId);
    const away = byId.get(g.awayId);
    if (!home || !away) throw new Error('simulateSeason: schedule references an unknown team');
    const result = simulateGame(makeId<'game'>(`g${idx + 1}`) as GameId, home, away, gameRng);
    outcomes.push({ homeId: g.homeId, awayId: g.awayId, homeWon: result.home.points > result.away.points });
    totalPoints += result.home.points + result.away.points;
    totalFgm += result.home.fgm + result.away.fgm;
    totalFga += result.home.fga + result.away.fga;
    boxScores.push(...result.home.boxScores, ...result.away.boxScores);
  });

  const standings = sortStandings(computeStandings(teams, outcomes), outcomes);
  const playerSeasons = aggregatePlayerSeasons(boxScores);
  return { gamesPlayed: outcomes.length, standings, outcomes, totalPoints, totalFgm, totalFga, playerSeasons };
}
