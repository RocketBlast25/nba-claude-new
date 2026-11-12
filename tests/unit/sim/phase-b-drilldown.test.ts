import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../../src/sim/core/random';
import { simulateSeason, type GameBoxScoreRecord } from '../../../src/sim/league/season';
import { selectBoxScore } from '../../../src/store/gameStore';
import { buildLeague, careerFrom } from '../store/leagueFixture';
import { useGameStore } from '../../../src/store/gameStore';
import { selectMoments } from '../../../src/sim/career/keyMoments';
import { COURT_WIDTH, COURT_HEIGHT } from '../../../src/possession/types';
import { snapshotCourt } from '../../../src/possession/replay';
import { createPossession, step } from '../../../src/possession/engine';
import type { SimTeam } from '../../../src/sim/background/gameSim';
import type { ScheduleTeam } from '../../../src/sim/league/schedule';

// Season sim takes teams with a SimTeam; the store fixture supplies the same shape.
function leagueTeams(seed: number): (ScheduleTeam & { sim: SimTeam })[] {
  return buildLeague(seed).map((t) => ({ id: t.id, conference: t.conference, sim: t.sim }) as ScheduleTeam & { sim: SimTeam });
}

describe('box-score drilldown (Phase B)', () => {
  it('keeps one box-score record per game with lines for both teams', () => {
    const season = simulateSeason(leagueTeams(11), new SeededRng(5));
    expect(season.gameBoxScores.length).toBe(season.gamesPlayed);
    for (const rec of season.gameBoxScores) {
      expect(rec.lines.length).toBeGreaterThan(0);
    }
  });

  it('box-score points sum to the game total points for each team', () => {
    const season = simulateSeason(leagueTeams(11), new SeededRng(5));
    const totalFromLines = season.gameBoxScores.reduce(
      (sum, rec) => sum + rec.lines.reduce((s, l) => s + l.points, 0),
      0,
    );
    expect(totalFromLines).toBe(season.totalPoints);
  });

  it('box-score FGM and FGA sum to the season field-goal totals', () => {
    const season = simulateSeason(leagueTeams(11), new SeededRng(5));
    const fgm = season.gameBoxScores.reduce((s, rec) => s + rec.lines.reduce((a, l) => a + l.fgm, 0), 0);
    const fga = season.gameBoxScores.reduce((s, rec) => s + rec.lines.reduce((a, l) => a + l.fga, 0), 0);
    expect(fgm).toBe(season.totalFgm);
    expect(fga).toBe(season.totalFga);
  });

  it('selectBoxScore returns the record for a known game and undefined otherwise', () => {
    const season = simulateSeason(leagueTeams(11), new SeededRng(5));
    const first = season.gameBoxScores[0] as GameBoxScoreRecord;
    expect(selectBoxScore(season, String(first.gameId))?.gameId).toBe(first.gameId);
    expect(selectBoxScore(season, 'missing')).toBeUndefined();
    expect(selectBoxScore(null, 'x')).toBeUndefined();
  });
});

describe('court replay snapshots (Phase B)', () => {
  it('replay frames are deterministic for the same seed', () => {
    const league = buildLeague(21);
    const career = careerFrom(league);
    const actors = career.players.slice(0, 5);
    const a = selectMoments('g1', 1, true, actors, new SeededRng(9));
    const b = selectMoments('g1', 1, true, actors, new SeededRng(9));
    expect(JSON.stringify(a.map((m) => m.replay))).toBe(JSON.stringify(b.map((m) => m.replay)));
  });

  it('replay positions stay within the 940x500 court bounds', () => {
    const league = buildLeague(21);
    const career = careerFrom(league);
    const actors = career.players.slice(0, 5);
    const moments = selectMoments('g1', 1, true, actors, new SeededRng(31));
    expect(moments.length).toBeGreaterThan(0);
    for (const m of moments) {
      for (const frame of m.replay ?? []) {
        expect(frame.ballPos.x).toBeGreaterThanOrEqual(0);
        expect(frame.ballPos.x).toBeLessThanOrEqual(COURT_WIDTH);
        expect(frame.ballPos.y).toBeGreaterThanOrEqual(0);
        expect(frame.ballPos.y).toBeLessThanOrEqual(COURT_HEIGHT);
        for (const p of frame.players) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(COURT_WIDTH);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThanOrEqual(COURT_HEIGHT);
        }
      }
    }
  });

  it('replay frames come from the engine, starting at the ball carrier', () => {
    const career = careerFrom(buildLeague(21));
    const actors = career.players.slice(0, 5);
    const [moment] = selectMoments('g3', 1, true, actors, new SeededRng(12));
    const frames = moment?.replay ?? [];
    expect(frames.length).toBe(8);
    const times = frames.map((f) => f.t);
    expect(times[0]).toBe(0);
    // Engine time advances in 60 Hz fixed steps, so the frame spacing is ~500 ms, not exact.
    for (let i = 1; i < times.length; i++) {
      expect(Math.abs((times[i] ?? 0) - (times[i - 1] ?? 0) - 500)).toBeLessThan(20);
    }
    const carrier = frames[0]?.players.find((p) => p.id === String(moment?.actorId));
    expect(carrier).toBeDefined();
    expect(frames[0]?.ballPos).toEqual({ x: carrier?.x, y: carrier?.y });
  });

  it('AI moments carry no replay data', () => {
    const league = buildLeague(21);
    const career = careerFrom(league);
    const moments = selectMoments('g2', 1, false, career.players.slice(0, 5), new SeededRng(4));
    for (const m of moments) expect(m.replay).toBeUndefined();
  });

  it('snapshotCourt clamps out-of-bounds entities and is stable', () => {
    const state = createPossession([
      { id: 'ball', teamId: null, x: -20, y: 600, vx: 0, vy: 0 },
      { id: 'p1' as never, teamId: null, x: 1000, y: 10, vx: 0, vy: 0 },
    ]);
    const snap = snapshotCourt(step(state, 0));
    expect(snap.ballPos).toEqual({ x: 0, y: COURT_HEIGHT });
    expect(snap.players[0]).toMatchObject({ x: COURT_WIDTH, y: 10 });
    expect(JSON.stringify(snapshotCourt(state))).toBe(JSON.stringify(snapshotCourt(state)));
  });
});

// Ensures the store module loads with the helpers the UI depends on.
describe('store selectors', () => {
  it('exposes the store hook', () => {
    expect(typeof useGameStore.getState).toBe('function');
  });
});
