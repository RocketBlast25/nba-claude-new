import type { SeededRng } from '../core/random';
import type { TeamId } from '../core/types';
import type { StandingRow } from './standings';
import { winPct } from './standings';
import { LEAGUE_CONFIG } from './leagueConfig';

export type Conference = 'East' | 'West';

export interface SeriesResult {
  higherSeed: TeamId;
  lowerSeed: TeamId;
  winner: TeamId;
  higherSeedWins: number;
  lowerSeedWins: number;
}

/** Plays one game between two teams, returning true when the home team wins. */
export type GameRunner = (home: TeamId, away: TeamId, rng: SeededRng) => boolean;

/**
 * Orders a conference's standings: win % descending, then team id for a stable order.
 * Ties on record are resolved by id so bracket seeding is deterministic.
 */
export function seedConference(rows: StandingRow[], conference: Conference): TeamId[] {
  return rows
    .filter((r) => r.conference === conference)
    .sort((a, b) => {
      const diff = winPct(b) - winPct(a);
      if (diff !== 0) return diff;
      return a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0;
    })
    .map((r) => r.teamId);
}

/**
 * Play-in: the 7th seed plays the 8th, 9th plays 10th, the 7/8 winner takes the 7th
 * playoff spot, and the loser of 9/10 plays the 7/8 loser for the 8th spot.
 * Returns the seeds 1-8 for the conference, in playoff order.
 */
export function runPlayIn(
  seeds: TeamId[],
  playGame: GameRunner,
  rng: SeededRng,
): { playoffSeeds: TeamId[]; eliminated: TeamId[]; games: { home: TeamId; away: TeamId; homeWon: boolean }[] } {
  const [s7, s8, s9, s10] = LEAGUE_CONFIG.playInSeeds.map((n) => seeds[n - 1]) as TeamId[];
  if (!s7 || !s8 || !s9 || !s10) throw new Error('runPlayIn: need at least 10 seeds');
  const games: { home: TeamId; away: TeamId; homeWon: boolean }[] = [];
  const play = (home: TeamId, away: TeamId): TeamId => {
    const homeWon = playGame(home, away, rng);
    games.push({ home, away, homeWon });
    return homeWon ? home : away;
  };
  const w78 = play(s7, s8);
  const l78 = w78 === s7 ? s8 : s7;
  const w910 = play(s9, s10);
  const l910 = w910 === s9 ? s10 : s9;
  // Loser of 7/8 hosts the winner of 9/10 for the 8th seed.
  const eighth = play(l78, w910);
  // Play-in eliminations: the loser of the 8th-seed game, and the loser of 9 vs 10
  // (its only remaining path to the 8th seed was the game above).
  const eliminated = [eighth === l78 ? w910 : l78, l910];
  return { playoffSeeds: [...seeds.slice(0, 6), w78, eighth], eliminated, games };
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

export interface PlayoffResult {
  champion: TeamId;
  runnerUp: TeamId;
  rounds: SeriesResult[][];
  /**
   * The 16 bracket teams ordered by how early they were eliminated: round 1, round 2,
   * conference finals, Finals runner-up, champion last. Play-in losers are excluded;
   * they are non-playoff teams for the draft. Teams eliminated in the same round are
   * ordered by regular-season record (worse record picks earlier), then team id.
   */
  exitOrder: TeamId[];
}

/**
 * Runs the full playoffs: a play-in per conference, then four best-of-7 rounds
 * (conference round 1, conference semis, conference finals, NBA Finals).
 * Higher seed is the team with the better regular-season record.
 */
export function runPlayoffs(
  standings: StandingRow[],
  playGame: GameRunner,
  rng: SeededRng,
): PlayoffResult {
  const conferences: Conference[] = ['East', 'West'];
  const rounds: SeriesResult[][] = [];

  const playInLosers: TeamId[] = [];
  const bracket = conferences.map((conf) => {
    const seeds = seedConference(standings, conf);
    const playIn = runPlayIn(seeds, playGame, rng.fork());
    playInLosers.push(...playIn.eliminated);
    return playIn.playoffSeeds;
  });

  // Each conference runs three rounds (round 1, semis, conference finals) on its own
  // bracket. rounds[0..2] hold every conference's series for that round.
  const confRounds: SeriesResult[][][] = bracket.map((seeds) => {
    const perRound: SeriesResult[][] = [];
    let pairs = firstRoundPairs(seeds);
    for (let r = 0; r < 3; r++) {
      const series = pairs.map(([a, b]) => playSeries(a, b, playGame, rng.fork()));
      perRound.push(series);
      pairs = pairUp(series.map((s) => s.winner));
    }
    return perRound;
  });
  for (let r = 0; r < 3; r++) rounds.push(confRounds.flatMap((c) => c[r] ?? []));

  // Conference champions meet in the NBA Finals.
  const confChampions = confRounds.map((c) => c[2]![0]!.winner);
  const finals = playSeries(confChampions[0] as TeamId, confChampions[1] as TeamId, playGame, rng.fork());
  rounds.push([finals]);
  const champion = finals.winner;
  const runnerUp = finals.higherSeed === champion ? finals.lowerSeed : finals.higherSeed;

  const exitOrder = buildExitOrder(standings, rounds, champion, runnerUp);
  return { champion, runnerUp, rounds, exitOrder };
}

/**
 * Orders playoff teams by elimination stage, earliest first. Within a stage, the
 * team with the worse regular-season record comes first, then team id.
 */
function buildExitOrder(
  standings: StandingRow[],
  rounds: SeriesResult[][],
  champion: TeamId,
  runnerUp: TeamId,
): TeamId[] {
  // Play-in losers missed the 16-team bracket, so they are non-playoff teams for the draft
  // and are not part of the exit order.
  const stages: TeamId[][] = [];
  for (const round of rounds.slice(0, 3)) {
    stages.push(round.map((s) => (s.winner === s.higherSeed ? s.lowerSeed : s.higherSeed)));
  }
  // Finals losers are the runner-up; the champion is always last.
  const record = new Map(standings.map((r) => [r.teamId, winPct(r)]));
  const ordered: TeamId[] = [];
  for (const stage of stages) {
    const sorted = [...stage].sort((a, b) => {
      const diff = (record.get(a) ?? 0) - (record.get(b) ?? 0);
      if (diff !== 0) return diff;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    ordered.push(...sorted);
  }
  ordered.push(runnerUp, champion);
  return ordered;
}

/** Pairs consecutive winners (1v2, 3v4) for the next round. */
function pairUp(winners: TeamId[]): [TeamId, TeamId][] {
  const out: [TeamId, TeamId][] = [];
  for (let i = 0; i < winners.length; i += 2) {
    out.push([winners[i] as TeamId, winners[i + 1] as TeamId]);
  }
  return out;
}

/**
 * Plays a best-of-7 series using the 2-2-1-1-1 home-court pattern. The higher seed
 * has home court in games 1, 2, 5, and 7 (see LEAGUE_CONFIG.homePattern).
 */
export function playSeries(higher: TeamId, lower: TeamId, playGame: GameRunner, rng: SeededRng): SeriesResult {
  let higherWins = 0;
  let lowerWins = 0;
  const pattern = LEAGUE_CONFIG.homePattern;
  for (let g = 0; g < pattern.length && higherWins < 4 && lowerWins < 4; g++) {
    const higherHome = pattern[g] === true;
    const home = higherHome ? higher : lower;
    const away = higherHome ? lower : higher;
    const homeWon = playGame(home, away, rng);
    const higherWon = homeWon === higherHome;
    if (higherWon) higherWins++;
    else lowerWins++;
  }
  return {
    higherSeed: higher,
    lowerSeed: lower,
    winner: higherWins === 4 ? higher : lower,
    higherSeedWins: higherWins,
    lowerSeedWins: lowerWins,
  };
}
