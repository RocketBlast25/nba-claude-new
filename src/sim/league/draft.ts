import type { SeededRng } from '../core/random';
import type { TeamId } from '../core/types';
import type { StandingRow } from './standings';
import { winPct } from './standings';
import { LEAGUE_CONFIG } from './leagueConfig';

/** Non-playoff teams ordered worst record first (ties broken by team id). */
export function reverseStandingsOrder(rows: StandingRow[]): TeamId[] {
  return [...rows]
    .sort((a, b) => {
      const diff = winPct(a) - winPct(b);
      if (diff !== 0) return diff;
      return a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0;
    })
    .map((r) => r.teamId);
}

/**
 * Draws the first four picks by weighted lottery among the 14 non-playoff teams.
 * `lotteryOrder` lists the teams worst record first; each is weighted by LEAGUE_CONFIG.lotteryOdds.
 * Returns the four winners in pick order (1-4).
 */
export function drawLottery(lotteryOrder: TeamId[], rng: SeededRng): TeamId[] {
  const odds = [...LEAGUE_CONFIG.lotteryOdds];
  const teams = [...lotteryOrder];
  const picks: TeamId[] = [];
  for (let p = 0; p < LEAGUE_CONFIG.lotteryPicks; p++) {
    const winner = rng.weighted(teams, odds);
    const idx = teams.indexOf(winner);
    picks.push(winner);
    teams.splice(idx, 1);
    odds.splice(idx, 1);
  }
  return picks;
}

export interface DraftPick {
  pick: number;
  teamId: TeamId;
}

/**
 * Builds the 30-pick draft order:
 * picks 1-4 from the weighted lottery (non-playoff teams), picks 5-14 for the
 * remaining non-playoff teams in reverse standings, and picks 15-30 for playoff
 * teams in playoff-exit order (earliest elimination picks first).
 *
 * @param standings All teams' regular-season standings.
 * @param playoffExitOrder Playoff teams ordered by how early they were eliminated
 *   (first team eliminated first). The champion goes last.
 */
export function buildDraftOrder(
  standings: StandingRow[],
  playoffTeams: TeamId[],
  playoffExitOrder: TeamId[],
  rng: SeededRng,
): DraftPick[] {
  const playoffSet = new Set(playoffTeams);
  const nonPlayoff = standings.filter((r) => !playoffSet.has(r.teamId));
  const lotteryOrder = reverseStandingsOrder(nonPlayoff);
  const lotteryWinners = drawLottery(lotteryOrder, rng);
  const lotterySet = new Set(lotteryWinners);
  const remaining = lotteryOrder.filter((t) => !lotterySet.has(t));
  const order = [...lotteryWinners, ...remaining, ...playoffExitOrder];
  return order.map((teamId, i) => ({ pick: i + 1, teamId }));
}
