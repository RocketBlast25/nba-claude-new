import type { SeededRng } from '../core/random';
import type { TeamId } from '../core/types';

export interface ScheduleTeam {
  id: TeamId;
  conference: 'East' | 'West';
  division: string;
}

export interface ScheduledGame {
  homeId: TeamId;
  awayId: TeamId;
}

/** Maximum games per pair: 4 within division, 4 in conference, 2 across conferences. */
const DIVISION_GAMES = 4;
const CONFERENCE_GAMES_MAX = 4;
const INTER_CONFERENCE_GAMES = 2;
export const GAMES_PER_TEAM = 82;
const MAX_ATTEMPTS = 500;

function pairMax(a: ScheduleTeam, b: ScheduleTeam): number {
  if (a.conference !== b.conference) return INTER_CONFERENCE_GAMES;
  if (a.division === b.division) return DIVISION_GAMES;
  return CONFERENCE_GAMES_MAX;
}

interface Pair {
  i: number;
  j: number;
  a: ScheduleTeam;
  b: ScheduleTeam;
}

/** One greedy pass. Returns games per pair (index into the pairs list) or null if a team falls short. */
function tryCounts(teams: ScheduleTeam[], rng: SeededRng): Map<Pair, number> | null {
  const need = teams.map(() => GAMES_PER_TEAM);
  const pairs: Pair[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const a = teams[i];
      const b = teams[j];
      if (a && b) pairs.push({ i, j, a, b });
    }
  }
  const counts = new Map<Pair, number>();

  // Give one more game each step to the open pair whose teams still need the most games.
  for (;;) {
    let best: Pair | null = null;
    let bestScore = -Infinity;
    for (const p of pairs) {
      const used = counts.get(p) ?? 0;
      const needI = need[p.i] ?? 0;
      const needJ = need[p.j] ?? 0;
      if (used >= pairMax(p.a, p.b) || needI <= 0 || needJ <= 0) continue;
      const score = needI + needJ + rng.next() * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (!best) break;
    counts.set(best, (counts.get(best) ?? 0) + 1);
    need[best.i] = (need[best.i] ?? 0) - 1;
    need[best.j] = (need[best.j] ?? 0) - 1;
  }

  return need.every((n) => n === 0) ? counts : null;
}

/**
 * Builds a deterministic 82-game schedule in which every team plays exactly
 * 82 games. Home and away alternate within each pair.
 */
export function buildSchedule(teams: ScheduleTeam[], rng: SeededRng): ScheduledGame[] {
  let counts: Map<Pair, number> | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !counts; attempt++) {
    counts = tryCounts(teams, rng.fork());
  }
  if (!counts) throw new Error('buildSchedule: could not satisfy 82 games per team');

  const games: ScheduledGame[] = [];
  for (const [p, n] of counts) {
    for (let g = 0; g < n; g++) {
      const home = g % 2 === 0 ? p.a : p.b;
      const away = g % 2 === 0 ? p.b : p.a;
      games.push({ homeId: home.id, awayId: away.id });
    }
  }
  return rng.shuffle(games);
}
