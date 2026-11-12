import { describe, expect, it } from 'vitest';
import { SIM_CONFIG } from '../../../src/sim/background/config';
import type { SimTeam } from '../../../src/sim/background/gameSim';
import type { GameBoxScore } from '../../../src/sim/core/models';
import { SeededRng } from '../../../src/sim/core/random';
import { makeId, type GameId, type PlayerId, type TeamId } from '../../../src/sim/core/types';
import { generateRoster } from '../../../src/sim/league/roster';
import type { ScheduleTeam } from '../../../src/sim/league/schedule';
import {
  actualFor,
  assignSeasonObjectives,
  evaluateSeasonObjectives,
  selectTriggeredGames,
  shouldTriggerKeyMoment,
  totalsFromBoxScores,
  type SeasonObjective,
  type TriggerGameSummary,
} from '../../../src/sim/career/keyMomentTriggers';
import { advanceSeason, resumeSeason, startSeason, type ResumableSeasonState } from '../../../src/sim/season/resumableSeason';

const USER = makeId<'team'>('T1') as TeamId;
const RIVAL = makeId<'team'>('T2') as TeamId;

/** Builds a league of `count` teams in two conferences, with sim ratings. */
function makeLeague(count: number, seed: number): (ScheduleTeam & { sim: SimTeam })[] {
  const rng = new SeededRng(seed);
  return Array.from({ length: count }, (_, i) => {
    const id = makeId<'team'>(`T${i + 1}`) as TeamId;
    const conference = i < count / 2 ? 'East' : 'West';
    const roster = generateRoster(id, 10, rng.fork());
    return {
      id,
      conference,
      division: `${conference}-${Math.floor(i / 5) % 3}`,
      sim: {
        id,
        pace: SIM_CONFIG.leaguePace,
        offRating: SIM_CONFIG.leagueOffRating,
        defRating: SIM_CONFIG.leagueOffRating,
        players: roster.map((p) => ({ id: p.id, attributes: p.attributes, stamina: p.stamina, usage: p.overall / 100 })),
      },
    };
  });
}

function summary(homePoints: number, awayPoints: number, playoff = false, overtimes = 0): TriggerGameSummary {
  return { homeId: USER, awayId: RIVAL, homePoints, awayPoints, overtimes, playoff };
}

describe('key moment triggers (pure)', () => {
  it('returns null for games that do not involve the user team', () => {
    const other = summary(100, 90);
    expect(shouldTriggerKeyMoment({ ...other, homeId: RIVAL, awayId: makeId<'team'>('T9') as TeamId }, USER)).toBeNull();
  });

  it('fires game-winner for a margin of 3 or less, before clutch', () => {
    expect(shouldTriggerKeyMoment(summary(101, 99), USER)).toBe('game_winner');
    expect(shouldTriggerKeyMoment(summary(104, 99), USER)).toBe('clutch_fourth');
  });

  it('returns null for a margin above 5 unless it is a playoff or rivalry game', () => {
    expect(shouldTriggerKeyMoment(summary(110, 100), USER)).toBeNull();
    expect(shouldTriggerKeyMoment(summary(110, 100, true), USER)).toBe('playoff_game');
    expect(shouldTriggerKeyMoment(summary(110, 100), USER, [[USER, RIVAL]])).toBe('rivalry');
  });

  it('is deterministic for the same input', () => {
    const g = summary(102, 100, false, 1);
    expect(shouldTriggerKeyMoment(g, USER)).toBe(shouldTriggerKeyMoment(g, USER));
  });

  it('selects the same regular-season games for the same seed', () => {
    const candidates = Array.from({ length: 20 }, (_, i) => ({ index: i, trigger: 'clutch_fourth' as const }));
    const a = selectTriggeredGames(candidates, new SeededRng(42));
    const b = selectTriggeredGames(candidates, new SeededRng(42));
    expect(a).toEqual(b);
    expect(a.length).toBeLessThanOrEqual(12);
  });
});

describe('resumable season (suspend and resume)', () => {
  // buildSchedule needs a full 30-team league to schedule 82 games per team.
  const league = makeLeague(30, 7);
  const sim = new Map(league.map((t) => [t.id, t.sim]));
  const fresh = (): ResumableSeasonState => startSeason(2026, USER, league, 99);

  it('pauses on a user Key Moment with userControlled true and a pre-game index', () => {
    const result = advanceSeason(fresh(), sim, league);
    if (result.status !== 'pending') throw new Error('expected a pending moment');
    expect(result.moment.userControlled).toBe(true);
    expect(result.state.nextGame).toBe(result.moment.gameIndex + 1);
    expect(result.state.pending).toEqual(result.moment);
  });

  it('resumes to completion with every game played exactly once', () => {
    let result = advanceSeason(fresh(), sim, league);
    let guard = 0;
    while (result.status === 'pending' && guard++ < 500) {
      result = resumeSeason(result.state, { success: true, reward: 0 }, sim, league);
    }
    expect(result.status).toBe('finished');
    expect(result.state.outcomes).toHaveLength(result.state.schedule.length);
    expect(result.state.pending).toBeNull();
  });

  it('gives the same game outcomes whether a moment is resolved or not', () => {
    // Each game uses its own RNG, so the decision must not change game results.
    const runWith = (decision: { success: boolean; reward: number }) => {
      let result = advanceSeason(fresh(), sim, league);
      let guard = 0;
      while (result.status === 'pending' && guard++ < 500) {
        result = resumeSeason(result.state, decision, sim, league);
      }
      if (result.status !== 'finished') throw new Error('season did not finish');
      return result;
    };
    const a = runWith({ success: true, reward: 0 });
    const b = runWith({ success: false, reward: 0 });
    expect(a.state.outcomes).toEqual(b.state.outcomes);
    expect(a.standings).toEqual(b.standings);
  });

  it('rejects resume when no moment is pending, so games cannot replay', () => {
    const state = fresh();
    expect(() => resumeSeason(state, { success: true, reward: 0 }, sim, league)).toThrow(/no Key Moment is pending/);
  });

  it('does not advance while a moment is pending', () => {
    const first = advanceSeason(fresh(), sim, league);
    if (first.status !== 'pending') throw new Error('expected a pending moment');
    const again = advanceSeason(first.state, sim, league);
    expect(again.state.nextGame).toBe(first.state.nextGame);
    expect(again.status).toBe('pending');
  });
});

const box = (pts: number, fgm: number, fga: number, ast: number): GameBoxScore => ({
  gameId: makeId<'game'>('g') as GameId,
  playerId: makeId<'player'>('p') as PlayerId,
  minutes: 30,
  points: pts,
  rebounds: 0,
  assists: ast,
  steals: 0,
  blocks: 0,
  turnovers: 0,
  fouls: 0,
  fgm,
  fga,
  threePm: 0,
  threePa: 0,
  ftm: 0,
  fta: 0,
});

describe('season objectives (fixture box scores)', () => {
  it('computes per-game and percentage stats from box score lines', () => {
    const totals = totalsFromBoxScores([box(20, 8, 16, 4), box(10, 4, 10, 2)], 3, 1);
    expect(actualFor('points_per_game', totals)).toBe(15);
    expect(actualFor('assists_per_game', totals)).toBe(3);
    expect(actualFor('fg_pct', totals)).toBeCloseTo(12 / 26);
    expect(actualFor('win_pct', totals)).toBe(0.75);
  });

  it('gives trust and XP for met objectives and takes trust for missed ones', () => {
    const totals = totalsFromBoxScores([box(20, 8, 16, 4), box(10, 4, 10, 2)], 3, 1);
    const objectives: SeasonObjective[] = [
      { id: 'points_per_game', label: 'PPG', target: 14 },
      { id: 'assists_per_game', label: 'APG', target: 5 },
    ];
    const result = evaluateSeasonObjectives(totals, objectives);
    expect(result.met.map((o) => o.id)).toEqual(['points_per_game']);
    expect(result.missed.map((o) => o.id)).toEqual(['assists_per_game']);
    expect(result.coachTrustDelta).toBe(3 - 2);
    expect(result.attributeXpBonus).toBe(1);
  });

  it('counts an objective with no games played as missed', () => {
    const result = evaluateSeasonObjectives(totalsFromBoxScores([], 0, 0), [
      { id: 'points_per_game', label: 'PPG', target: 10 },
    ]);
    expect(result.met).toEqual([]);
    expect(result.missed).toHaveLength(1);
  });

  it('assigns 2 or 3 objectives, deterministically for a seed', () => {
    const a = assignSeasonObjectives(72, 'starter', new SeededRng(5));
    const b = assignSeasonObjectives(72, 'starter', new SeededRng(5));
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(2);
    expect(a.length).toBeLessThanOrEqual(3);
  });
});
