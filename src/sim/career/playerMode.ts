import type { Player } from '../core/models';
import type { PlayerId, TeamId } from '../core/types';
import type { PlayerSeasonLine } from '../league/playerSeason';
import type { StandingRow } from '../league/standings';
import { winPct } from '../league/standings';
import { PLAYER_MODE_CONFIG } from './playerModeConfig';

/** Role on the user's team, derived from roster rank and overall (never stored). */
export type PlayerRole = 'bench' | 'sixth_man' | 'starter' | 'franchise';

export type TrophyKind =
  | 'championship'
  | 'finals_mvp'
  | 'mvp'
  | 'dpoy'
  | 'all_star'
  | 'all_league';

export interface Trophy {
  kind: TrophyKind;
  season: number;
  teamId: TeamId;
}

/**
 * Cumulative career totals, summed over every completed regular season and playoff
 * run. Stored on player mode so a save carries the player's whole career.
 */
export interface CareerStats {
  /** Regular-season games played. */
  gamesPlayed: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  /** Playoff games played. */
  playoffGames: number;
  playoffPoints: number;
  /** Playoff runs that ended in the NBA Finals (won or lost). */
  finalsAppearances: number;
}

/** All-zero career totals, also the shape older saves are upgraded to. */
export function emptyCareerStats(): CareerStats {
  return {
    gamesPlayed: 0,
    points: 0,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    playoffGames: 0,
    playoffPoints: 0,
    finalsAppearances: 0,
  };
}

/** Totals a completed regular season or playoff run contributes. */
export type CareerStatDelta = Partial<CareerStats>;

/** Adds one completed run's totals. Pure: returns a new stats object. */
export function addCareerStats(stats: CareerStats, delta: CareerStatDelta): CareerStats {
  return {
    gamesPlayed: stats.gamesPlayed + (delta.gamesPlayed ?? 0),
    points: stats.points + (delta.points ?? 0),
    rebounds: stats.rebounds + (delta.rebounds ?? 0),
    assists: stats.assists + (delta.assists ?? 0),
    steals: stats.steals + (delta.steals ?? 0),
    blocks: stats.blocks + (delta.blocks ?? 0),
    playoffGames: stats.playoffGames + (delta.playoffGames ?? 0),
    playoffPoints: stats.playoffPoints + (delta.playoffPoints ?? 0),
    finalsAppearances: stats.finalsAppearances + (delta.finalsAppearances ?? 0),
  };
}

/** The user-controlled player's career state. Saved as an optional field on CareerState. */
export interface PlayerCareerMode {
  playerId: PlayerId;
  /** 0 to 100. */
  coachTrust: number;
  /** 0 to 100. How content the player is with role, trust and team success. */
  happiness: number;
  /** 0 to 100. How high the player's bar for team success. */
  ambition: number;
  trophies: Trophy[];
  /** Lifetime totals across every completed season. */
  careerStats: CareerStats;
}

export interface RoleInput {
  /** The player's 1-based rank by overall on their roster. */
  rosterRank: number;
  overall: number;
  /** Whether the player is in the starting five. */
  isStarter: boolean;
}

/**
 * Derives the player's role. Franchise needs the top roster rank and an overall
 * at or above the configured floor; starters and sixth men follow rank bands.
 */
export function deriveRole(input: RoleInput): PlayerRole {
  const r = PLAYER_MODE_CONFIG.role;
  if (input.rosterRank === 1 && input.overall >= r.franchiseOverall) return 'franchise';
  if (input.isStarter) return 'starter';
  if (input.rosterRank <= r.sixthManMaxRank) return 'sixth_man';
  return 'bench';
}

export function clamp0to100(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** Creates the initial player-mode state for a player on a team. */
export function createPlayerCareerMode(player: Player): PlayerCareerMode {
  const c = PLAYER_MODE_CONFIG.initial;
  return {
    playerId: player.id,
    coachTrust: c.coachTrust,
    happiness: c.happiness,
    ambition: clamp0to100(c.ambitionBase + player.overall * c.ambitionPerOverall),
    trophies: [],
    careerStats: emptyCareerStats(),
  };
}

/** Applies a signed change to coach trust, clamped to 0 to 100. */
export function applyCoachTrustDelta(mode: PlayerCareerMode, delta: number): PlayerCareerMode {
  return { ...mode, coachTrust: clamp0to100(mode.coachTrust + delta) };
}

export interface HappinessInput {
  role: PlayerRole;
  /** Team win fraction for the season, 0 to 1. */
  teamWinPct: number;
}

/**
 * Moves happiness toward a target set by role, trust and team success. Each season
 * closes part of the gap, so one bad season does not swing happiness fully.
 * Ambition raises the team success needed to keep the player content.
 */
export function updateHappiness(mode: PlayerCareerMode, input: HappinessInput): PlayerCareerMode {
  const h = PLAYER_MODE_CONFIG.happiness;
  const roleTerm = h.roleBonus[input.role];
  const trustTerm = (mode.coachTrust - 50) * h.trustWeight;
  const successBar = (mode.ambition / 100) * h.ambitionWeight;
  const successTerm = (input.teamWinPct - 0.5 - successBar * h.successBarScale) * h.successWeight;
  const target = clamp0to100(h.baseline + roleTerm + trustTerm + successTerm);
  const next = mode.happiness + (target - mode.happiness) * h.adjustRate;
  return { ...mode, happiness: clamp0to100(next) };
}

/** Records a trophy. Duplicate awards for the same season and kind are ignored. */
export function recordTrophy(mode: PlayerCareerMode, trophy: Trophy): PlayerCareerMode {
  const exists = mode.trophies.some(
    (t) => t.kind === trophy.kind && t.season === trophy.season && t.teamId === trophy.teamId,
  );
  if (exists) return mode;
  return { ...mode, trophies: [...mode.trophies, trophy] };
}

/**
 * Award rules. Transparent on purpose: an MVP is the best impact score in the league,
 * All-NBA is the top 15 by that score, and DPOY values steals and blocks most.
 */
export const AWARD_RULES = {
  /** Games needed to qualify for a season award. */
  minGames: 41,
  /** Players on the All-NBA teams. */
  allNbaSize: 15,
  /** Impact weights for MVP and All-NBA. */
  impact: { ppg: 1, rpg: 0.7, apg: 0.7, spg: 0.5, bpg: 0.5, winPct: 20 },
  /** Defensive player of the year weights. */
  defense: { spg: 2, bpg: 2, rpg: 0.3 },
} as const;

export interface SeasonAwards {
  mvp: PlayerId | null;
  dpoy: PlayerId | null;
  /** Top 15 players by impact score, best first. */
  allNba: PlayerId[];
}

interface AwardCandidate {
  playerId: PlayerId;
  gamesPlayed: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  winPct: number;
}

function impactOf(c: AwardCandidate): number {
  const w = AWARD_RULES.impact;
  return (
    w.ppg * c.ppg +
    w.rpg * c.rpg +
    w.apg * c.apg +
    w.spg * c.spg +
    w.bpg * c.bpg +
    w.winPct * (c.winPct - 0.5)
  );
}

function defenseOf(c: AwardCandidate): number {
  const w = AWARD_RULES.defense;
  return w.spg * c.spg + w.bpg * c.bpg + w.rpg * c.rpg;
}

/** Highest score first, then player id so the winner is stable for equal scores. */
function bestBy(candidates: AwardCandidate[], score: (c: AwardCandidate) => number): PlayerId | null {
  let best: AwardCandidate | null = null;
  for (const c of candidates) {
    if (!best) {
      best = c;
      continue;
    }
    const diff = score(c) - score(best);
    if (diff > 0 || (diff === 0 && c.playerId < best.playerId)) best = c;
  }
  return best?.playerId ?? null;
}

/**
 * Picks the season's MVP, Defensive Player of the Year and All-NBA teams from
 * league-wide per-game averages. Players below the games floor are considered only
 * when too few players qualify (a short season still produces awards).
 */
export function selectSeasonAwards(
  playerSeasons: PlayerSeasonLine[],
  teamByPlayer: Map<PlayerId, TeamId>,
  standings: StandingRow[],
): SeasonAwards {
  const record = new Map(standings.map((r) => [r.teamId, winPct(r)]));
  const all: AwardCandidate[] = playerSeasons.map((line) => ({
    playerId: line.playerId,
    gamesPlayed: line.gamesPlayed,
    ppg: line.averages.points,
    rpg: line.averages.rebounds,
    apg: line.averages.assists,
    spg: line.averages.steals,
    bpg: line.averages.blocks,
    winPct: record.get(teamByPlayer.get(line.playerId) ?? ('' as TeamId)) ?? 0.5,
  }));
  const qualified = all.filter((c) => c.gamesPlayed >= AWARD_RULES.minGames);
  const pool = qualified.length >= 5 ? qualified : all;
  const allNba = [...pool]
    .sort((a, b) => impactOf(b) - impactOf(a) || (a.playerId < b.playerId ? -1 : 1))
    .slice(0, AWARD_RULES.allNbaSize)
    .map((c) => c.playerId);
  return {
    mvp: bestBy(pool, impactOf),
    dpoy: bestBy(pool, defenseOf),
    allNba,
  };
}

/** Records the trophies the controlled player earned from a season's awards. */
export function applySeasonAwards(
  mode: PlayerCareerMode,
  args: { season: number; teamId: TeamId; playerId: PlayerId; awards: SeasonAwards },
): PlayerCareerMode {
  let next = mode;
  const { season, teamId, playerId, awards } = args;
  if (awards.mvp === playerId) next = recordTrophy(next, { kind: 'mvp', season, teamId });
  if (awards.dpoy === playerId) next = recordTrophy(next, { kind: 'dpoy', season, teamId });
  if (awards.allNba.includes(playerId)) next = recordTrophy(next, { kind: 'all_league', season, teamId });
  return next;
}

/**
 * Counts consecutive seasons below the unhappy threshold. Resets to zero on any season
 * at or above it, so a single good season restarts the count.
 */
export function nextUnhappySeasons(previous: number, happiness: number): number {
  return happiness < PLAYER_MODE_CONFIG.trade.unhappyThreshold ? previous + 1 : 0;
}

/** True once the unhappy streak reaches the configured number of seasons. */
export function shouldRequestTrade(unhappySeasons: number): boolean {
  return unhappySeasons >= PLAYER_MODE_CONFIG.trade.unhappySeasonsToRequest;
}
