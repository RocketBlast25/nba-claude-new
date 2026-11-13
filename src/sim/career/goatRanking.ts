/**
 * Deterministic GOAT score and all-time leaderboard (Milestone 11).
 *
 * The formula is deliberately transparent: hardware first (rings, Finals MVPs, MVPs,
 * All-NBA), then career volume, then per-game dominance. Every weight is exported so
 * the UI and the tests can explain a score instead of treating it as a black box.
 *
 * Pure: reads career state, returns plain data. No store, no React, no DOM.
 */
import type { PlayerId } from '../core/types';
import type { CareerState } from './types';
import { GOAT_LEGENDS } from './goatCatalog';
import { emptyCareerStats, type Trophy, type TrophyKind } from './playerMode';

export const GOAT_WEIGHTS = {
  /** Points of score per championship. */
  rings: 1000,
  /** Per Finals MVP. */
  finalsMvps: 600,
  /** Per regular-season MVP. */
  mvps: 700,
  /** Per All-NBA selection. */
  allNbaSelections: 150,
  /** Points of score per 1,000 career regular-season points. */
  pointsPerThousand: 60,
  /** Points of score per 1,000 career rebounds. */
  reboundsPerThousand: 20,
  /** Points of score per 1,000 career assists. */
  assistsPerThousand: 30,
  /** Points of score per 1,000 career playoff points. */
  playoffPointsPerThousand: 40,
  /** Per point of career scoring average. */
  ppg: 10,
  /** Per rebound of career average. */
  rpg: 5,
  /** Per assist of career average. */
  apg: 5,
} as const;

/** Score floors for each tier, highest first. */
export const GOAT_TIER_FLOORS = {
  'GOAT Contender': 15000,
  'Mount Rushmore': 11000,
  'Inner Circle HOF': 6000,
  'Hall of Famer': 2000,
} as const;

export type GoatTier =
  | 'GOAT Contender'
  | 'Mount Rushmore'
  | 'Inner Circle HOF'
  | 'Hall of Famer'
  | 'All-Star Legacy';

/** Everything the score reads, for a legend or for the controlled player. */
export interface GoatProfile {
  name: string;
  rings: number;
  finalsMvps: number;
  mvps: number;
  allNbaSelections: number;
  careerPoints: number;
  careerRebounds: number;
  careerAssists: number;
  /** Playoff points are a volume bonus; legends' entries do not record them. */
  playoffPoints: number;
  ppg: number;
  rpg: number;
  apg: number;
}

export interface GoatLeaderboardEntry {
  rank: number;
  isUser: boolean;
  /** Catalog id for a legend, null for the controlled player. */
  legendId: string | null;
  name: string;
  goatScore: number;
  tier: GoatTier;
  /** What the controlled player needs to pass the next name up. Null for legends. */
  nextMilestoneHint: string | null;
}

/** Score weight of a single career point, used to explain "score N points to pass". */
const SCORE_PER_POINT = GOAT_WEIGHTS.pointsPerThousand / 1000;

/**
 * The GOAT score for one profile. Rounded to one decimal so equal profiles compare
 * exactly and the board is stable across runs.
 */
export function computeGoatScore(profile: GoatProfile): number {
  const w = GOAT_WEIGHTS;
  const raw =
    profile.rings * w.rings +
    profile.finalsMvps * w.finalsMvps +
    profile.mvps * w.mvps +
    profile.allNbaSelections * w.allNbaSelections +
    (profile.careerPoints / 1000) * w.pointsPerThousand +
    (profile.careerRebounds / 1000) * w.reboundsPerThousand +
    (profile.careerAssists / 1000) * w.assistsPerThousand +
    (profile.playoffPoints / 1000) * w.playoffPointsPerThousand +
    profile.ppg * w.ppg +
    profile.rpg * w.rpg +
    profile.apg * w.apg;
  return Math.round(raw * 10) / 10;
}

/** The tier a score falls into. */
export function tierForScore(score: number): GoatTier {
  if (score >= GOAT_TIER_FLOORS['GOAT Contender']) return 'GOAT Contender';
  if (score >= GOAT_TIER_FLOORS['Mount Rushmore']) return 'Mount Rushmore';
  if (score >= GOAT_TIER_FLOORS['Inner Circle HOF']) return 'Inner Circle HOF';
  if (score >= GOAT_TIER_FLOORS['Hall of Famer']) return 'Hall of Famer';
  return 'All-Star Legacy';
}

/** Trophy counts by kind. Unknown kinds are ignored. */
export function countTrophies(trophies: Trophy[]): Record<TrophyKind, number> {
  const counts: Record<TrophyKind, number> = {
    championship: 0,
    finals_mvp: 0,
    mvp: 0,
    dpoy: 0,
    all_star: 0,
    all_league: 0,
  };
  for (const t of trophies) {
    if (t.kind in counts) counts[t.kind] += 1;
  }
  return counts;
}

/**
 * The controlled player's GOAT profile, built from their trophies and cumulative
 * career totals. A career without player mode (or a different player id) scores zero.
 */
export function userGoatProfile(state: CareerState, userPlayerId: PlayerId): GoatProfile {
  const mode = state.playerMode?.playerId === userPlayerId ? state.playerMode : null;
  const stats = mode?.careerStats ?? emptyCareerStats();
  const trophies = countTrophies(mode?.trophies ?? []);
  const name = state.players.find((p) => p.id === userPlayerId)?.name ?? 'Your player';
  const games = stats.gamesPlayed;
  return {
    name,
    rings: trophies.championship,
    finalsMvps: trophies.finals_mvp,
    mvps: trophies.mvp,
    allNbaSelections: trophies.all_league,
    careerPoints: stats.points,
    careerRebounds: stats.rebounds,
    careerAssists: stats.assists,
    playoffPoints: stats.playoffPoints,
    ppg: games > 0 ? stats.points / games : 0,
    rpg: games > 0 ? stats.rebounds / games : 0,
    apg: games > 0 ? stats.assists / games : 0,
  };
}

/** Thousands separators without relying on a locale. */
export function formatGoatNumber(value: number): string {
  const rounded = Math.round(value);
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * The hint shown under the controlled player's row: a concrete way to pass the next
 * name up, either by winning rings or by scoring.
 */
function milestoneHint(
  userScore: number,
  target: { name: string; goatScore: number; rank: number },
): string {
  const gap = Math.max(target.goatScore - userScore, 0);
  const rings = Math.max(1, Math.ceil(gap / GOAT_WEIGHTS.rings));
  const points = Math.max(1, Math.ceil(gap / SCORE_PER_POINT));
  return `Win ${rings} more ${rings === 1 ? 'ring' : 'rings'} or score ${formatGoatNumber(points)} pts to pass ${target.name} (#${target.rank})`;
}

interface Row {
  profile: GoatProfile;
  isUser: boolean;
  legendId: string | null;
  score: number;
}

/**
 * Ranks the controlled player against the all-time catalog. Returns every legend plus
 * the player, sorted by score (ties ordered by name), ranked from 1. Deterministic for
 * a given career state.
 */
export function rankAgainstGoats(state: CareerState, userPlayerId: PlayerId): GoatLeaderboardEntry[] {
  const user = userGoatProfile(state, userPlayerId);
  const rows: Row[] = GOAT_LEGENDS.map((legend) => ({
    profile: {
      name: legend.name,
      rings: legend.rings,
      finalsMvps: legend.finalsMvps,
      mvps: legend.mvps,
      allNbaSelections: legend.allNbaSelections,
      careerPoints: legend.careerPoints,
      careerRebounds: legend.careerRebounds,
      careerAssists: legend.careerAssists,
      playoffPoints: 0,
      ppg: legend.ppg,
      rpg: legend.rpg,
      apg: legend.apg,
    },
    isUser: false,
    legendId: legend.id,
    score: 0,
  }));
  for (const row of rows) row.score = computeGoatScore(row.profile);
  const userRow: Row = { profile: user, isUser: true, legendId: null, score: computeGoatScore(user) };
  rows.push(userRow);

  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.profile.name < b.profile.name ? -1 : a.profile.name > b.profile.name ? 1 : 0;
  });

  return rows.map((row, index) => {
    const rank = index + 1;
    const above = index > 0 ? rows[index - 1]! : null;
    return {
      rank,
      isUser: row.isUser,
      legendId: row.legendId,
      name: row.profile.name,
      goatScore: row.score,
      tier: tierForScore(row.score),
      nextMilestoneHint: !row.isUser
        ? null
        : above
          ? // `above` sits at rank `index`, one place ahead of this row.
            milestoneHint(row.score, { name: above.profile.name, goatScore: above.score, rank: index })
          : 'You are the GOAT: there is no one left to pass.',
    };
  });
}
