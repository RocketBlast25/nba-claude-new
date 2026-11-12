import type { Player } from '../core/models';
import type { PlayerId, TeamId } from '../core/types';
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

/** The user-controlled player's career state. Saved as an optional field on CareerState. */
export interface PlayerCareerMode {
  playerId: PlayerId;
  /** 0 to 100. */
  coachTrust: number;
  /** 0 to 100. How content the player is with role, trust and team success. */
  happiness: number;
  /** 0 to 100. How high the player's bar is for team success. */
  ambition: number;
  trophies: Trophy[];
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
