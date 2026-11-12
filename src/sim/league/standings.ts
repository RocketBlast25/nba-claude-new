import type { TeamId } from '../core/types';

export interface GameOutcome {
  homeId: TeamId;
  awayId: TeamId;
  homeWon: boolean;
}

export interface StandingRow {
  teamId: TeamId;
  conference: 'East' | 'West';
  wins: number;
  losses: number;
}

export function winPct(row: { wins: number; losses: number }): number {
  const games = row.wins + row.losses;
  return games === 0 ? 0 : row.wins / games;
}

/** Head-to-head wins of `a` over `b` across the given games. */
function headToHead(a: TeamId, b: TeamId, games: GameOutcome[]): number {
  let wins = 0;
  for (const g of games) {
    const pair = (g.homeId === a && g.awayId === b) || (g.homeId === b && g.awayId === a);
    if (!pair) continue;
    const winner = g.homeWon ? g.homeId : g.awayId;
    if (winner === a) wins++;
  }
  return wins;
}

/** Builds standings rows from game outcomes. Teams start at 0-0. */
export function computeStandings(
  teams: { id: TeamId; conference: 'East' | 'West' }[],
  games: GameOutcome[],
): StandingRow[] {
  const rows = new Map<TeamId, StandingRow>();
  for (const t of teams) rows.set(t.id, { teamId: t.id, conference: t.conference, wins: 0, losses: 0 });
  for (const g of games) {
    const home = rows.get(g.homeId);
    const away = rows.get(g.awayId);
    if (!home || !away) throw new Error('computeStandings: game references an unknown team');
    if (g.homeWon) {
      home.wins++;
      away.losses++;
    } else {
      away.wins++;
      home.losses++;
    }
  }
  return [...rows.values()];
}

/**
 * Sorts by win %, descending. Ties are broken by head-to-head record in the
 * games provided, then by team id so the order is stable.
 */
export function sortStandings(rows: StandingRow[], games: GameOutcome[]): StandingRow[] {
  return [...rows].sort((a, b) => {
    const diff = winPct(b) - winPct(a);
    if (diff !== 0) return diff;
    const h2h = headToHead(b.teamId, a.teamId, games) - headToHead(a.teamId, b.teamId, games);
    if (h2h !== 0) return h2h;
    return a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0;
  });
}
