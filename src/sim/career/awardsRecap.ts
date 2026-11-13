/**
 * End-of-season awards recap (career awards surface).
 *
 * Winners come from `selectSeasonAwards`; this module only explains them. Vote shares
 * are derived from the same impact and defense scores, so the top-5 breakdown always
 * agrees with the winner and no new randomness is introduced.
 *
 * Pure: reads season lines and standings, returns plain data. No store, no React, no DOM.
 */
import type { PlayerId, TeamId } from '../core/types';
import type { PlayerSeasonLine } from '../league/playerSeason';
import type { StandingRow } from '../league/standings';
import { winPct } from '../league/standings';
import { AWARD_RULES, type SeasonAwards } from './playerMode';

export type RecapAwardKind = 'mvp' | 'dpoy' | 'all_league' | 'finals_mvp';

/** One candidate on an award's ballot, with their share of the top-5 total. */
export interface AwardVoteEntry {
  playerId: PlayerId;
  /** Raw score from the award's scoring rule (higher is better). */
  score: number;
  /** Share of the top-5 score total, 0 to 1. */
  share: number;
  rank: number;
}

export interface AwardRecapEntry {
  kind: RecapAwardKind;
  /** Winner, or null when no eligible candidate exists. */
  winnerId: PlayerId | null;
  /** Top five candidates, best first. */
  top: AwardVoteEntry[];
  /** The controlled player's rank on this ballot, or null if not in the top pool. */
  userRank: number | null;
}

export interface AwardsRecap {
  season: number;
  entries: AwardRecapEntry[];
  /** Every award the controlled player won this season, in display order. */
  userAwards: RecapAwardKind[];
}

interface ScoredCandidate {
  playerId: PlayerId;
  score: number;
}

const impactWeights = AWARD_RULES.impact;
const defenseWeights = AWARD_RULES.defense;

/**
 * Score for one ballot. Mirrors `selectSeasonAwards`: MVP and All-NBA use impact,
 * DPOY uses defense, and the Finals MVP is not on this ballot (it is a playoff award).
 */
function scoreLine(
  line: PlayerSeasonLine,
  winPctOf: number,
  kind: Exclude<RecapAwardKind, 'finals_mvp'>,
): number {
  const a = line.averages;
  if (kind === 'dpoy') {
    return defenseWeights.spg * a.steals + defenseWeights.bpg * a.blocks + defenseWeights.rpg * a.rebounds;
  }
  return (
    impactWeights.ppg * a.points +
    impactWeights.rpg * a.rebounds +
    impactWeights.apg * a.assists +
    impactWeights.spg * a.steals +
    impactWeights.bpg * a.blocks +
    impactWeights.winPct * (winPctOf - 0.5)
  );
}

/** Top-5 ballot with shares. Shares are over the top five only, so they sum to 1. */
function ballotFor(scored: ScoredCandidate[], userId: PlayerId): Omit<AwardRecapEntry, 'kind'> {
  const sorted = [...scored].sort((a, b) => b.score - a.score || (a.playerId < b.playerId ? -1 : 1));
  const top5 = sorted.slice(0, 5);
  // Scores can be negative for impact on a weak record; shares use positive mass only.
  const floor = Math.min(0, ...top5.map((c) => c.score));
  const total = top5.reduce((sum, c) => sum + (c.score - floor), 0);
  const top: AwardVoteEntry[] = top5.map((c, i) => ({
    playerId: c.playerId,
    score: c.score,
    share: total > 0 ? (c.score - floor) / total : 1 / top5.length,
    rank: i + 1,
  }));
  const userIdx = sorted.findIndex((c) => c.playerId === userId);
  return {
    winnerId: top[0]?.playerId ?? null,
    top,
    userRank: userIdx === -1 ? null : userIdx + 1,
  };
}

/**
 * Finals MVP ballot for a champion: their roster ranked by playoff points. The winner
 * matches the rule in `applyPlayoffOutcome` (the leading playoff scorer). Returns null
 * when the champion has no playoff points, since no Finals MVP is awarded then.
 */
export function buildFinalsMvpBallot(args: {
  championRosterIds: PlayerId[];
  playoffPointsByPlayer: Map<PlayerId, number>;
  userPlayerId: PlayerId;
}): AwardRecapEntry | null {
  const scored = args.championRosterIds.map((playerId) => ({
    playerId,
    score: args.playoffPointsByPlayer.get(playerId) ?? 0,
  }));
  const best = Math.max(0, ...scored.map((c) => c.score));
  if (best <= 0) return null;
  return { kind: 'finals_mvp', ...ballotFor(scored, args.userPlayerId) };
}

/**
 * Builds the awards recap for one completed season. Winners match `selectSeasonAwards`
 * exactly (same qualifying pool), so the recap never disagrees with the trophies.
 */
export function buildAwardsRecap(args: {
  season: number;
  playerSeasons: PlayerSeasonLine[];
  teamByPlayer: Map<PlayerId, TeamId>;
  standings: StandingRow[];
  userPlayerId: PlayerId;
  awards: SeasonAwards;
}): AwardsRecap {
  const { season, playerSeasons, teamByPlayer, standings, userPlayerId, awards } = args;
  const record = new Map(standings.map((r) => [r.teamId, winPct(r)]));
  const all = playerSeasons.map((line) => ({
    line,
    winPctOf: record.get(teamByPlayer.get(line.playerId) ?? ('' as TeamId)) ?? 0.5,
  }));
  const qualified = all.filter((c) => c.line.gamesPlayed >= AWARD_RULES.minGames);
  const pool = qualified.length >= 5 ? qualified : all;

  const ballot = (kind: Exclude<RecapAwardKind, 'finals_mvp'>): AwardRecapEntry => ({
    kind,
    ...ballotFor(
      pool.map((c) => ({ playerId: c.line.playerId, score: scoreLine(c.line, c.winPctOf, kind) })),
      userPlayerId,
    ),
  });

  // All-NBA is a 15-player list; the recap shows its top five by impact and marks the user.
  const entries: AwardRecapEntry[] = [ballot('mvp'), ballot('dpoy'), ballot('all_league')];

  const userAwards: RecapAwardKind[] = [];
  if (awards.mvp === userPlayerId) userAwards.push('mvp');
  if (awards.dpoy === userPlayerId) userAwards.push('dpoy');
  if (awards.allNba.includes(userPlayerId)) userAwards.push('all_league');
  return { season, entries, userAwards };
}
