import type { GameOutcome, StandingRow } from '../league/standings';
import { computeStandings, sortStandings } from '../league/standings';
import { buildSchedule, type ScheduledGame, type ScheduleTeam } from '../league/schedule';
import { simulateGame, type SimTeam, type GameResult } from '../background/gameSim';
import { SeededRng } from '../core/random';
import { makeId, type GameId, type TeamId } from '../core/types';
import type { GameBoxScore } from '../core/models';
import {
  shouldTriggerKeyMoment,
  type TriggerGameSummary,
  type TriggerKind,
} from '../career/keyMomentTriggers';

/**
 * Resumable season simulation. The season advances one scheduled game at a time.
 * When a user-team game matches a Key Moment trigger, the loop stops and returns a
 * pending moment. `resumeSeason` applies the user's decision and carries on.
 *
 * Each game's RNG comes from (season seed, game index), not from a shared stream. So a
 * game's result does not depend on when the loop paused, and resuming cannot change
 * what happened in earlier games.
 */

export interface PendingKeyMoment {
  /** Index of the scheduled game that triggered the stop. */
  gameIndex: number;
  gameId: GameId;
  trigger: TriggerKind;
  homeId: TeamId;
  awayId: TeamId;
  /** Final score of the game the moment belongs to. */
  homePoints: number;
  awayPoints: number;
  /** Always true: the moment is controlled by the user's team. */
  userControlled: true;
}

export interface ResumableSeasonState {
  season: number;
  userTeamId: TeamId;
  seed: number;
  /** Full regular-season schedule, fixed when the season starts. */
  schedule: ScheduledGame[];
  /** Index of the next game to play. Equals schedule.length when the regular season is done. */
  nextGame: number;
  outcomes: GameOutcome[];
  /** Per-game box score records, in schedule order, for finished games. */
  gameBoxScores: { gameId: GameId; homeId: TeamId; awayId: TeamId; lines: GameBoxScore[] }[];
  /** A moment awaiting the user's decision. Null when none is pending. */
  pending: PendingKeyMoment | null;
  /** Consumed moments in order, for review. */
  resolved: { gameIndex: number; trigger: TriggerKind; decision: UserDecision }[];
  /** Set when the regular season has finished. */
  standings: StandingRow[] | null;
}

/** What the user chose for a Key Moment. Interpreted by resumeSeason. */
export interface UserDecision {
  /** Whether the user's possession outcome was a success. */
  success: boolean;
  /** Reward credited to the user's team, applied to the next game's context. */
  reward: number;
}

export type AdvanceResult =
  | { status: 'pending'; state: ResumableSeasonState; moment: PendingKeyMoment }
  | { status: 'finished'; state: ResumableSeasonState; standings: StandingRow[] };

/** Builds the initial state for a season. Does not play any games. */
export function startSeason(
  season: number,
  userTeamId: TeamId,
  teams: ScheduleTeam[],
  seed: number,
): ResumableSeasonState {
  const schedule = buildSchedule(teams, new SeededRng(seed).fork());
  return {
    season,
    userTeamId,
    seed,
    schedule,
    nextGame: 0,
    outcomes: [],
    gameBoxScores: [],
    pending: null,
    resolved: [],
    standings: null,
  };
}

/** A deterministic per-game RNG, independent of the order games are played in. */
function gameRngFor(seed: number, gameIndex: number): SeededRng {
  return new SeededRng((seed + Math.imul(gameIndex + 1, 0x9e3779b1)) >>> 0);
}

function summarize(result: GameResult, game: ScheduledGame, playoff: boolean): TriggerGameSummary {
  return {
    homeId: game.homeId,
    awayId: game.awayId,
    homePoints: result.home.points,
    awayPoints: result.away.points,
    overtimes: result.overtimes,
    playoff,
  };
}

/**
 * Plays regular-season games until one triggers a user Key Moment, or the season ends.
 * Returns immediately with `pending` set. Calling it again with a pending moment does
 * nothing until the moment is resolved through resumeSeason.
 */
export function advanceSeason(
  state: ResumableSeasonState,
  teams: Map<TeamId, SimTeam>,
  leagueTeams: ScheduleTeam[],
): AdvanceResult {
  if (state.pending) {
    return { status: 'pending', state, moment: state.pending };
  }

  let current: ResumableSeasonState = { ...state, outcomes: [...state.outcomes], gameBoxScores: [...state.gameBoxScores] };
  while (current.nextGame < current.schedule.length) {
    const index = current.nextGame;
    const game = current.schedule[index]!;
    const home = teams.get(game.homeId);
    const away = teams.get(game.awayId);
    if (!home || !away) throw new Error('advanceSeason: schedule references an unknown team');

    const gameId = makeId<'game'>(`g${index + 1}`) as GameId;
    const result = simulateGame(gameId, home, away, gameRngFor(current.seed, index));

    current.outcomes.push({
      homeId: game.homeId,
      awayId: game.awayId,
      homeWon: result.home.points > result.away.points,
    });
    current.gameBoxScores.push({
      gameId,
      homeId: game.homeId,
      awayId: game.awayId,
      lines: [...result.home.boxScores, ...result.away.boxScores],
    });
    current.nextGame = index + 1;

    const trigger = shouldTriggerKeyMoment(summarize(result, game, false), current.userTeamId);
    if (trigger) {
      const moment: PendingKeyMoment = {
        gameIndex: index,
        gameId,
        trigger,
        homeId: game.homeId,
        awayId: game.awayId,
        homePoints: result.home.points,
        awayPoints: result.away.points,
        userControlled: true,
      };
      current = { ...current, pending: moment };
      return { status: 'pending', state: current, moment };
    }
  }

  const standings = sortStandings(
    computeStandings(leagueTeams, current.outcomes),
    current.outcomes,
  );
  current = { ...current, standings };
  return { status: 'finished', state: current, standings };
}

/**
 * Applies the user's decision to the pending moment and continues the season until the
 * next trigger or the end. The pending moment is cleared. Throws when no moment is
 * pending, so a double resume cannot replay games.
 */
export function resumeSeason(
  state: ResumableSeasonState,
  decision: UserDecision,
  teams: Map<TeamId, SimTeam>,
  leagueTeams: ScheduleTeam[],
): AdvanceResult {
  if (!state.pending) throw new Error('resumeSeason: no Key Moment is pending');
  const resolved = [
    ...state.resolved,
    { gameIndex: state.pending.gameIndex, trigger: state.pending.trigger, decision },
  ];
  const cleared: ResumableSeasonState = { ...state, pending: null, resolved };
  return advanceSeason(cleared, teams, leagueTeams);
}

/** Pure check for whether the regular season is complete. */
export function isRegularSeasonDone(state: ResumableSeasonState): boolean {
  return state.nextGame >= state.schedule.length && state.pending === null;
}
