import type { GameOutcome, StandingRow } from '../league/standings';
import { computeStandings, sortStandings } from '../league/standings';
import { buildSchedule, type ScheduledGame, type ScheduleTeam } from '../league/schedule';
import { simulateGame, type SimTeam, type GameResult } from '../background/gameSim';
import { SeededRng } from '../core/random';
import { makeId, type GameId, type TeamId } from '../core/types';
import type { GameBoxScore } from '../core/models';
import { seedConference, type PlayoffResult, type SeriesResult } from '../league/playoffs';
import { winPct } from '../league/standings';
import { LEAGUE_CONFIG } from '../league/leagueConfig';
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

/* ------------------------------------------------------------------ */
/* Resumable playoffs. Mirrors runPlayoffs (play-in, then 3 rounds, then Finals).     */
/* ------------------------------------------------------------------ */

export type PlayoffRound = 'play_in' | 'round_1' | 'round_2' | 'conference_finals' | 'finals' | 'done';

/** One best-of-7 or play-in game series, with its RNG stored as a raw integer. */
export interface PlayoffSeriesState {
  higherSeed: TeamId;
  lowerSeed: TeamId;
  /** 1 for a play-in game, 7 for a best-of-7 series. */
  bestOf: 1 | 7;
  higherWins: number;
  lowerWins: number;
  /** Raw SeededRng state for this series; advanced as games are played. */
  rngState: number;
  /** Games already played in this series. */
  gamesPlayed: number;
}

export interface PendingPlayoffMoment {
  /** Index of the playoff game in the full run, counted from 0. */
  gameIndex: number;
  round: PlayoffRound;
  trigger: 'playoff_game';
  homeId: TeamId;
  awayId: TeamId;
  userControlled: true;
}

export interface PlayoffsRunState {
  userTeamId: TeamId;
  season: number;
  round: PlayoffRound;
  /** Conference seeds 1-10, East first. */
  seeds: TeamId[][];
  /** Conference being played: 0 = East, 1 = West, 2 = NBA Finals. */
  conference: 0 | 1 | 2;
  /** Series in the current stage (play-in, a bracket round, or the Finals). */
  series: PlayoffSeriesState[];
  /** Index of the series being played. */
  seriesIndex: number;
  /** Raw state of the run RNG that forks each stream, in runPlayoffs fork order. */
  forkRngState: number;
  /** Playoff seeds 1-8 per conference, filled once that conference's play-in finishes. */
  playoffSeeds: (TeamId[] | null)[];
  /** Winners of the current bracket round, in bracket order. */
  winners: TeamId[];
  /** Teams eliminated so far, in exit order (play-in losers excluded). */
  exitOrder: TeamId[];
  /** Completed bracket rounds, for PlayoffResult.rounds. */
  rounds: PlayoffResult['rounds'];
  /** Index of the next playoff game in the full run. */
  nextGame: number;
  pending: PendingPlayoffMoment | null;
  resolved: { gameIndex: number; decision: UserDecision }[];
  /** Regular-season win% per team, used to order each stage's exits. */
  standingsRecord: Record<TeamId, number>;
  /** Set once the playoffs finish. */
  result: PlayoffResult | null;
}

export type PlayoffAdvanceResult =
  | { status: 'pending'; state: PlayoffsRunState; moment: PendingPlayoffMoment }
  | { status: 'finished'; state: PlayoffsRunState; result: PlayoffResult };

/** Plays one game of a series with its stored RNG, returning the updated series and whether home won. */
function playOneGame(
  s: PlayoffSeriesState,
  playGame: PlayoffGameRunner,
): { series: PlayoffSeriesState; homeWon: boolean; home: TeamId; away: TeamId } {
  const higherHome = higherHostsGame(s, s.gamesPlayed);
  const home = higherHome ? s.higherSeed : s.lowerSeed;
  const away = higherHome ? s.lowerSeed : s.higherSeed;
  const rng = SeededRng.fromState(s.rngState);
  const homeWon = playGame(home, away, rng);
  const higherWon = homeWon === higherHome;
  const next: PlayoffSeriesState = {
    ...s,
    higherWins: s.higherWins + (higherWon ? 1 : 0),
    lowerWins: s.lowerWins + (higherWon ? 0 : 1),
    rngState: rng.getState(),
    gamesPlayed: s.gamesPlayed + 1,
  };
  return { series: next, homeWon, home, away };
}

function seriesDone(s: PlayoffSeriesState): boolean {
  return s.bestOf === 1 ? s.gamesPlayed === 1 : s.higherWins === 4 || s.lowerWins === 4;
}

function seriesWinner(s: PlayoffSeriesState): TeamId {
  return s.bestOf === 1
    ? s.higherWins === 1 ? s.higherSeed : s.lowerSeed
    : s.higherWins === 4 ? s.higherSeed : s.lowerSeed;
}

function seriesLoser(s: PlayoffSeriesState): TeamId {
  return seriesWinner(s) === s.higherSeed ? s.lowerSeed : s.higherSeed;
}

/** Pairs seeds 1v8, 4v5, 3v6, 2v7 within one conference's eight playoff teams. */
function firstRoundPairs(seeds: TeamId[]): [TeamId, TeamId][] {
  const s = (n: number) => seeds[n - 1] as TeamId;
  return [
    [s(1), s(8)],
    [s(4), s(5)],
    [s(3), s(6)],
    [s(2), s(7)],
  ];
}

/** Pure: next round's pairings from winners in bracket order (1v2, 3v4 ...). */
function pairUp(winners: TeamId[]): [TeamId, TeamId][] {
  const out: [TeamId, TeamId][] = [];
  for (let i = 0; i < winners.length; i += 2) out.push([winners[i] as TeamId, winners[i + 1] as TeamId]);
  return out;
}

export type PlayoffGameRunner = (home: TeamId, away: TeamId, rng: SeededRng) => boolean;

/** Series state for one best-of-7 bracket series; `rngState` is the series' own stream. */
function bracketSeries(higher: TeamId, lower: TeamId, forkState: number): { series: PlayoffSeriesState; forkState: number } {
  const parent = SeededRng.fromState(forkState);
  const series = newSeries(higher, lower, 7, parent.fork());
  return { series, forkState: parent.getState() };
}

/**
 * Plays the playoffs until the run finishes or a user-team game needs a decision.
 * Pauses before any game involving `userTeamId` and returns the pending moment.
 */
export function advancePlayoffsRun(state: PlayoffsRunState, playGame: PlayoffGameRunner): PlayoffAdvanceResult {
  if (state.pending) return { status: 'pending', state, moment: state.pending };
  let cur: PlayoffsRunState = state;
  while (cur.round !== 'done') {
    const s = cur.series[cur.seriesIndex];
    if (!s) {
      // Stage finished: advance to the next stage (and set the result after the Finals).
      cur = advanceStage(cur);
      if (cur.round === 'done') break;
      continue;
    }
    if (seriesDone(s)) {
      // Pass this game's stream state on to the next play-in game, so play-in shares one stream.
      const nextSeries = cur.round === 'play_in' ? cur.series[cur.seriesIndex + 1] : undefined;
      const series = nextSeries
        ? cur.series.map((x, i) => (i === cur.seriesIndex + 1 ? { ...x, rngState: s.rngState } : x))
        : cur.series;
      cur = { ...cur, series, seriesIndex: cur.seriesIndex + 1 };
      continue;
    }
    const higherHome = higherHostsGame(s, s.gamesPlayed);
    const home = higherHome ? s.higherSeed : s.lowerSeed;
    const away = higherHome ? s.lowerSeed : s.higherSeed;
    const alreadyResolved = cur.resolved.some((r) => r.gameIndex === cur.nextGame);
    if ((cur.userTeamId === home || cur.userTeamId === away) && !alreadyResolved) {
      const moment: PendingPlayoffMoment = {
        gameIndex: cur.nextGame,
        round: cur.round,
        trigger: 'playoff_game',
        homeId: home,
        awayId: away,
        userControlled: true,
      };
      return { status: 'pending', state: { ...cur, pending: moment }, moment };
    }
    const played = playOneGame(s, playGame);
    cur = {
      ...cur,
      nextGame: cur.nextGame + 1,
      series: cur.series.map((x, i) => (i === cur.seriesIndex ? played.series : x)),
    };
  }
  return { status: 'finished', state: cur, result: cur.result! };
}

/** Applies the user's decision to the pending moment, then continues. Throws when none is pending. */
export function resumePlayoffsRun(
  state: PlayoffsRunState,
  decision: UserDecision,
  playGame: PlayoffGameRunner,
): PlayoffAdvanceResult {
  if (!state.pending) throw new Error('resumePlayoffsRun: no playoff moment is pending');
  const resolved = [...state.resolved, { gameIndex: state.pending.gameIndex, decision }];
  return advancePlayoffsRun({ ...state, pending: null, resolved }, playGame);
}

/**
 * Moves to the next stage once the current one's series are all done. Order matches
 * runPlayoffs: each conference's play-in (with its 8th-seed game), East's bracket rounds,
 * West's bracket rounds, then the NBA Finals.
 */
function advanceStage(state: PlayoffsRunState): PlayoffsRunState {
  if (state.round === 'play_in') return afterPlayIn(state);
  if (state.round === 'finals') return finishRun(state);
  return advanceBracket(state);
}

/**
 * Play-in for a conference is done. The 8th-seed game is the third play-in game; once it
 * finishes, the conference's seeds 1-8 are fixed and the bracket begins.
 */
function afterPlayIn(state: PlayoffsRunState): PlayoffsRunState {
  const series = state.series;
  if (series.length === 2) {
    // Queue the 8th-seed game on the same conference fork as runPlayIn (after 7v8 and 9v10).
    const [g78, g910] = series as [PlayoffSeriesState, PlayoffSeriesState];
    // runPlayIn draws all three play-in games from one conference stream, in order, so the
    // 8th-seed game continues from the stream state left by 9v10.
    const eighth = newSeries(seriesLoser(g78), seriesWinner(g910), 1, SeededRng.fromState(g910.rngState));
    return { ...state, series: [...series, eighth], seriesIndex: 2 };
  }
  const [g78, , g8] = series as [PlayoffSeriesState, PlayoffSeriesState, PlayoffSeriesState];
  const seeds = state.seeds[state.conference]!;
  const playoffSeeds = [...seeds.slice(0, 6), seriesWinner(g78), seriesWinner(g8)];
  const next = { ...state, playoffSeeds: state.playoffSeeds.map((p, i) => (i === state.conference ? playoffSeeds : p)) };
  if (state.conference === 0) return startWestPlayIn(next);
  return buildBracketRound({ ...next, conference: 0 }, 'round_1', firstRoundPairs(next.playoffSeeds[0]!));
}

/** East's play-in is done: fork West's play-in stream and queue its 7v8 and 9v10 games. */
function startWestPlayIn(state: PlayoffsRunState): PlayoffsRunState {
  const parent = SeededRng.fromState(state.forkRngState);
  const westRng = parent.fork();
  return {
    ...state,
    conference: 1,
    round: 'play_in',
    series: playInRound(state.seeds[1]!, westRng),
    seriesIndex: 0,
    forkRngState: parent.getState(),
  };
}

/**
 * A bracket round is done: record its losers in exit order, then build the next round for
 * this conference, or move to the next conference, or to the Finals.
 */
function advanceBracket(state: PlayoffsRunState): PlayoffsRunState {
  const winners = state.series.map(seriesWinner);
  const rounds = [...state.rounds, state.series.map(finished)];
  const next = { ...state, rounds };
  const conferenceDone = state.round === 'conference_finals';
  if (!conferenceDone) {
    const nextRound = state.round === 'round_1' ? 'round_2' : 'conference_finals';
    return buildBracketRound(next, nextRound, pairUp(winners));
  }
  // Conference champion is set; move to the other conference or the Finals. East's champion
  // is kept in `winners` so the West bracket's rounds cannot wipe it before the Finals.
  const champ = winners[0]!;
  if (state.conference === 0) return startWestBracket({ ...next, winners: [champ] });
  const [eastChamp] = state.winners;
  return buildBracketRound({ ...next, winners: [eastChamp!, champ] }, 'finals', [[eastChamp!, champ]]);
}

function buildBracketRound(state: PlayoffsRunState, round: PlayoffRound, pairs: [TeamId, TeamId][]): PlayoffsRunState {
  let forkState = state.forkRngState;
  const series: PlayoffSeriesState[] = [];
  for (const [a, b] of pairs) {
    const made = bracketSeries(a, b, forkState);
    series.push(made.series);
    forkState = made.forkState;
  }
  // `winners` is not reset here: it holds East's champion from the East Finals until the Finals.
  return { ...state, round, series, seriesIndex: 0, forkRngState: forkState };
}

function startWestBracket(state: PlayoffsRunState): PlayoffsRunState {
  const seeds = state.playoffSeeds[1];
  if (!seeds) throw new Error('startWestBracket: West play-in not finished');
  return buildBracketRound({ ...state, conference: 1 }, 'round_1', firstRoundPairs(seeds));
}

/** Orders a stage's eliminated teams by regular-season win% ascending, then team id. */
function sortByRecord(teams: TeamId[], state: PlayoffsRunState): TeamId[] {
  const rec = state.standingsRecord;
  return [...teams].sort((a, b) => {
    const diff = (rec[a] ?? 0) - (rec[b] ?? 0);
    if (diff !== 0) return diff;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function finished(s: PlayoffSeriesState): SeriesResult {
  return {
    higherSeed: s.higherSeed,
    lowerSeed: s.lowerSeed,
    winner: seriesWinner(s),
    higherSeedWins: s.higherWins,
    lowerSeedWins: s.lowerWins,
  };
}

/** The Finals are done: set the terminal result and status. */
function finishRun(state: PlayoffsRunState): PlayoffsRunState {
  const finals = state.series[0]!;
  const champion = seriesWinner(finals);
  const runnerUp = seriesLoser(finals);
  const rounds = [...state.rounds, [finished(finals)]];
  // Rounds were recorded conference by conference (East R1, R2, CF, then West). Regroup
  // them by stage across both conferences, as runPlayoffs does, then order each stage.
  const bracket = state.rounds.map((r) => r.map((s) => ({ ...s })));
  const stageOf = (idx: number) => [bracket[idx]!, bracket[idx + 3]!];
  const stages = [0, 1, 2].map((r) => stageOf(r).flatMap((rs) => rs.map((s) => (s.winner === s.higherSeed ? s.lowerSeed : s.higherSeed))));
  const exitOrder = [
    ...stages.flatMap((stage) => sortByRecord(stage, state)),
    runnerUp,
    champion,
  ];
  return {
    ...state,
    round: 'done',
    rounds,
    exitOrder,
    result: { champion, runnerUp, rounds, exitOrder },
  };
}

/** Home team in a series game: homePattern[g] for best-of-7, the lower seed hosts only in play-in. */
function higherHostsGame(s: PlayoffSeriesState, g: number): boolean {
  if (s.bestOf === 1) return true;
  return LEAGUE_CONFIG.homePattern[g] === true;
}

/**
 * Builds the run for both conferences. Each conference gets one fork, taken in runPlayoffs
 * order (East, then West), which runPlayIn draws 7v8, 9v10 and the 8th-seed game from.
 * The 8th-seed game is queued once both play-in games finish.
 */
export function startPlayoffsRun(
  season: number,
  userTeamId: TeamId,
  standings: StandingRow[],
  seed: number,
): PlayoffsRunState {
  const forkRng = new SeededRng(seed);
  const seeds = (['East', 'West'] as const).map((c) => seedConference(standings, c));
  // The East play-in is the first stage; its conference fork is drawn before any play.
  const eastRng = forkRng.fork();
  const series = playInRound(seeds[0]!, eastRng);
  const standingsRecord = Object.fromEntries(standings.map((r) => [r.teamId, winPct(r)])) as Record<TeamId, number>;
  return {
    userTeamId,
    season,
    round: 'play_in',
    seeds,
    conference: 0,
    series,
    seriesIndex: 0,
    forkRngState: forkRng.getState(),
    playoffSeeds: [null, null],
    winners: [],
    exitOrder: [],
    rounds: [],
    standingsRecord,
    nextGame: 0,
    pending: null,
    resolved: [],
    result: null,
  };
}

/**
 * The 7v8 and 9v10 play-in games for one conference. Each game starts from the state the
 * previous game left, so all three play-in games draw from one conference stream, as runPlayIn does.
 */
function playInRound(seeds: TeamId[], rng: SeededRng): PlayoffSeriesState[] {
  const [s7, s8, s9, s10] = LEAGUE_CONFIG.playInSeeds.map((n) => seeds[n - 1] as TeamId);
  const g78 = newSeries(s7!, s8!, 1, rng);
  const g910 = { ...newSeries(s9!, s10!, 1, rng), rngState: rng.getState() };
  return [g78, g910];
}

function newSeries(higher: TeamId, lower: TeamId, bestOf: 1 | 7, rng: SeededRng): PlayoffSeriesState {
  return {
    higherSeed: higher,
    lowerSeed: lower,
    bestOf,
    higherWins: 0,
    lowerWins: 0,
    rngState: rng.getState(),
    gamesPlayed: 0,
  };
}

