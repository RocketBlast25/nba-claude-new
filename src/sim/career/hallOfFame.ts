/**
 * Retirement and Hall of Fame (career legacy).
 *
 * A retirement locks the controlled player's final career into a `HallOfFameEntry`: the
 * totals, trophies, GOAT score and rank at that moment, and a short list of highlights.
 * Entries are plain data so they can be saved on their own, separate from the live career.
 *
 * Pure: reads career state, returns plain data. No store, no React, no DOM.
 */
import type { PlayerId } from '../core/types';
import type { CareerState } from './types';
import { countTrophies, rankAgainstGoats, userGoatProfile, computeGoatScore, tierForScore, type GoatTier } from './goatRanking';
import { emptyCareerStats, type CareerStats } from './playerMode';

export interface HallOfFameEntry {
  /** Stable key: one entry per retired player. */
  playerId: string;
  name: string;
  /** Season the player retired after. */
  retiredSeason: number;
  age: number;
  yearsPro: number;
  /** Final career totals, locked at retirement. */
  careerStats: CareerStats;
  rings: number;
  finalsMvps: number;
  mvps: number;
  allNbaSelections: number;
  dpoy: number;
  ppg: number;
  rpg: number;
  apg: number;
  /** GOAT score and tier at retirement. */
  goatScore: number;
  tier: GoatTier;
  /** The player's rank on the all-time board at retirement (1 is the GOAT). */
  goatRank: number;
  /** Short, human-readable career highlights for the ceremony. */
  highlights: string[];
}

/**
 * Whether the controlled player may retire now: they must be in player mode and not
 * already retired, so a retirement is recorded once.
 */
export function canRetire(career: CareerState, userPlayerId: PlayerId): boolean {
  if (!career.playerMode || career.playerMode.playerId !== userPlayerId) return false;
  const row = career.careers.find((c) => c.playerId === userPlayerId);
  return !row?.retired;
}

/** Age at which the game prompts an optional retirement. */
export const RETIREMENT_PROMPT_AGE = 38;

/** True when the controlled player is old enough to be offered retirement at the offseason. */
export function shouldPromptRetirement(career: CareerState, userPlayerId: PlayerId): boolean {
  if (!canRetire(career, userPlayerId)) return false;
  const player = career.players.find((p) => p.id === userPlayerId);
  return !!player && player.age >= RETIREMENT_PROMPT_AGE;
}

/** Highlights from a career: rings, MVPs, scoring and longevity, in a fixed order. */
function highlightsFor(entry: {
  name: string;
  rings: number;
  mvps: number;
  finalsMvps: number;
  allNbaSelections: number;
  dpoy: number;
  careerStats: CareerStats;
  yearsPro: number;
}): string[] {
  const out: string[] = [];
  if (entry.rings > 0) out.push(`${entry.rings} ${entry.rings === 1 ? 'championship' : 'championships'}`);
  if (entry.finalsMvps > 0) out.push(`${entry.finalsMvps} Finals ${entry.finalsMvps === 1 ? 'MVP' : 'MVPs'}`);
  if (entry.mvps > 0) out.push(`${entry.mvps} league ${entry.mvps === 1 ? 'MVP' : 'MVPs'}`);
  if (entry.dpoy > 0) out.push(`${entry.dpoy} Defensive Player of the Year`);
  if (entry.allNbaSelections > 0) out.push(`${entry.allNbaSelections} All-NBA ${entry.allNbaSelections === 1 ? 'selection' : 'selections'}`);
  if (entry.careerStats.points > 0) out.push(`${Math.round(entry.careerStats.points).toLocaleString('en-US')} career points`);
  if (entry.yearsPro > 0) out.push(`${entry.yearsPro} ${entry.yearsPro === 1 ? 'season' : 'seasons'} in the league`);
  return out;
}

/**
 * Locks the controlled player's career into a Hall of Fame entry. Pure: the caller
 * decides when to save it. Rank uses the same board as the GOAT leaderboard.
 */
export function buildHallOfFameEntry(career: CareerState, userPlayerId: PlayerId): HallOfFameEntry {
  const mode = career.playerMode;
  const player = career.players.find((p) => p.id === userPlayerId);
  const row = career.careers.find((c) => c.playerId === userPlayerId);
  const yearsPro = row?.yearsPro ?? 0;
  const profile = userGoatProfile(career, userPlayerId);
  const trophies = countTrophies(mode?.trophies ?? []);
  const stats = mode?.careerStats ?? emptyCareerStats();
  const goatScore = computeGoatScore(profile);
  const board = rankAgainstGoats(career, userPlayerId);
  const goatRank = board.find((row) => row.isUser)?.rank ?? board.length;
  const base = {
    name: profile.name,
    rings: trophies.championship,
    finalsMvps: trophies.finals_mvp,
    mvps: trophies.mvp,
    allNbaSelections: trophies.all_league,
    dpoy: trophies.dpoy,
    careerStats: stats,
    yearsPro,
  };
  return {
    playerId: String(userPlayerId),
    ...base,
    retiredSeason: career.season,
    age: player?.age ?? 0,
    ppg: profile.ppg,
    rpg: profile.rpg,
    apg: profile.apg,
    goatScore,
    tier: tierForScore(goatScore),
    goatRank,
    highlights: highlightsFor(base),
  };
}
