import type { GameBoxScore } from '../core/models';
import type { PlayerId } from '../core/types';

/** Counting stats summed across a season (TR-background-sim-005). */
export const COUNTING_STATS = [
  'minutes',
  'points',
  'rebounds',
  'assists',
  'steals',
  'blocks',
  'turnovers',
  'fouls',
  'fgm',
  'fga',
  'threePm',
  'threePa',
  'ftm',
  'fta',
] as const;

export type CountingStat = (typeof COUNTING_STATS)[number];

export interface PlayerSeasonLine {
  playerId: PlayerId;
  gamesPlayed: number;
  totals: Record<CountingStat, number>;
  averages: Record<CountingStat, number>;
}

/** Sums each player's box scores into season totals and per-game averages. */
export function aggregatePlayerSeasons(boxScores: GameBoxScore[]): PlayerSeasonLine[] {
  const byPlayer = new Map<PlayerId, PlayerSeasonLine>();
  for (const bs of boxScores) {
    let line = byPlayer.get(bs.playerId);
    if (!line) {
      line = {
        playerId: bs.playerId,
        gamesPlayed: 0,
        totals: Object.fromEntries(COUNTING_STATS.map((k) => [k, 0])) as Record<CountingStat, number>,
        averages: Object.fromEntries(COUNTING_STATS.map((k) => [k, 0])) as Record<CountingStat, number>,
      };
      byPlayer.set(bs.playerId, line);
    }
    line.gamesPlayed++;
    for (const k of COUNTING_STATS) line.totals[k] += bs[k];
  }
  for (const line of byPlayer.values()) {
    for (const k of COUNTING_STATS) {
      line.averages[k] = line.gamesPlayed > 0 ? line.totals[k] / line.gamesPlayed : 0;
    }
  }
  return [...byPlayer.values()];
}
