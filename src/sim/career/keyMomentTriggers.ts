import type { GameBoxScore } from '../core/models';
import type { TeamId } from '../core/types';
import type { SeededRng } from '../core/random';
import type { PlayerRole } from './playerMode';
import { PLAYER_MODE_CONFIG } from './playerModeConfig';

/** A pair of team ids that play a rivalry game. Order does not matter. */
export type RivalryPair = readonly [TeamId, TeamId];

const KEY_MOMENT_TRIGGER_CONFIG = {
  ...PLAYER_MODE_CONFIG.keyMoments,
  objectives: PLAYER_MODE_CONFIG.objectives,
};

/** Why a game stopped for the user. */
export type TriggerKind = 'clutch_fourth' | 'game_winner' | 'rivalry' | 'playoff_game';

/**
 * A finished game summary used for trigger checks. The possession sim has no quarter
 * clock, so clutch and game-winner checks use the final margin and overtime count.
 */
export interface TriggerGameSummary {
  homeId: TeamId;
  awayId: TeamId;
  homePoints: number;
  awayPoints: number;
  overtimes: number;
  playoff: boolean;
}

/** Score differential as an absolute value. */
export function scoreDiffOf(game: TriggerGameSummary): number {
  return Math.abs(game.homePoints - game.awayPoints);
}

export function isRivalryGame(homeId: TeamId, awayId: TeamId, pairs: readonly RivalryPair[]): boolean {
  return pairs.some(
    ([a, b]) => (a === homeId && b === awayId) || (a === awayId && b === homeId),
  );
}

/**
 * Returns the trigger that applies to a user-team game, or null. Priority is
 * playoffs, then game-winner, then clutch, then rivalry. Non-user games never trigger.
 */
export function shouldTriggerKeyMoment(
  game: TriggerGameSummary,
  userTeamId: TeamId,
  rivalries: readonly RivalryPair[] = KEY_MOMENT_TRIGGER_CONFIG.rivalries,
): TriggerKind | null {
  const involved = game.homeId === userTeamId || game.awayId === userTeamId;
  if (!involved) return null;
  const cfg = KEY_MOMENT_TRIGGER_CONFIG;
  const diff = scoreDiffOf(game);
  if (game.playoff) return 'playoff_game';
  if (diff <= cfg.gameWinnerMaxDiff) return 'game_winner';
  if (diff <= cfg.clutchMaxDiff) return 'clutch_fourth';
  if (isRivalryGame(game.homeId, game.awayId, rivalries)) return 'rivalry';
  return null;
}

/**
 * Picks which of a set of candidate games are kept for a user-facing moment, using the
 * seeded RNG so the same seed picks the same games. Playoff games are always kept.
 */
export function selectTriggeredGames(
  candidates: { index: number; trigger: TriggerKind }[],
  rng: SeededRng,
): number[] {
  const max = KEY_MOMENT_TRIGGER_CONFIG.maxRegularSeasonMoments;
  const playoff = candidates.filter((c) => c.trigger === 'playoff_game').map((c) => c.index);
  const regular = candidates.filter((c) => c.trigger !== 'playoff_game').map((c) => c.index);
  const kept: number[] = [];
  const pool = [...regular];
  while (pool.length > 0 && kept.length < max) {
    const pick = rng.int(0, pool.length - 1);
    kept.push(pool.splice(pick, 1)[0]!);
  }
  return [...playoff, ...kept.sort((a, b) => a - b)];
}

export interface SeasonObjective {
  id: 'points_per_game' | 'win_pct' | 'fg_pct' | 'assists_per_game';
  label: string;
  target: number;
}

/**
 * Assigns 2 or 3 season objectives based on role. Targets are the role's configured
 * base, raised by the player's overall, so higher-rated players get harder targets.
 */
export function assignSeasonObjectives(
  overall: number,
  role: PlayerRole,
  rng: SeededRng,
): SeasonObjective[] {
  const cfg = KEY_MOMENT_TRIGGER_CONFIG.objectives;
  const count = rng.int(cfg.minCount, cfg.maxCount);
  const pool = [...cfg.catalog];
  const chosen: SeasonObjective[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = rng.int(0, pool.length - 1);
    const entry = pool.splice(idx, 1)[0]!;
    const base = entry.base[role];
    const target = base + (overall - cfg.overallBaseline) * entry.perOverall;
    chosen.push({ id: entry.id, label: entry.label, target: Math.round(target * 100) / 100 });
  }
  return chosen;
}

export interface ObjectiveEvaluation {
  met: SeasonObjective[];
  missed: SeasonObjective[];
  coachTrustDelta: number;
  attributeXpBonus: number;
}

/** Season totals for one player, derived from box scores. */
export interface SeasonTotals {
  games: number;
  points: number;
  assists: number;
  fgm: number;
  fga: number;
  wins: number;
  losses: number;
}

/** Sums a player's box score lines into season totals. Win/loss is passed in. */
export function totalsFromBoxScores(
  lines: GameBoxScore[],
  wins: number,
  losses: number,
): SeasonTotals {
  let points = 0;
  let assists = 0;
  let fgm = 0;
  let fga = 0;
  for (const l of lines) {
    points += l.points;
    assists += l.assists;
    fgm += l.fgm;
    fga += l.fga;
  }
  return { games: lines.length, points, assists, fgm, fga, wins, losses };
}

/** Returns the actual value of an objective's stat, or null if it can't be computed. */
export function actualFor(id: SeasonObjective['id'], t: SeasonTotals): number | null {
  if (t.games === 0) return null;
  switch (id) {
    case 'points_per_game':
      return t.points / t.games;
    case 'assists_per_game':
      return t.assists / t.games;
    case 'fg_pct':
      return t.fga === 0 ? null : t.fgm / t.fga;
    case 'win_pct':
      return t.wins + t.losses === 0 ? null : t.wins / (t.wins + t.losses);
  }
}

/**
 * Compares season results to objectives. Each met objective adds to coach trust and
 * XP; each missed one takes trust away. Unmeasurable objectives count as missed.
 */
export function evaluateSeasonObjectives(
  totals: SeasonTotals,
  objectives: SeasonObjective[],
): ObjectiveEvaluation {
  const cfg = KEY_MOMENT_TRIGGER_CONFIG.objectives;
  const met: SeasonObjective[] = [];
  const missed: SeasonObjective[] = [];
  for (const o of objectives) {
    const actual = actualFor(o.id, totals);
    if (actual !== null && actual >= o.target) met.push(o);
    else missed.push(o);
  }
  return {
    met,
    missed,
    coachTrustDelta: met.length * cfg.trustPerMet - missed.length * cfg.trustPerMissed,
    attributeXpBonus: met.length * cfg.xpPerMet,
  };
}
