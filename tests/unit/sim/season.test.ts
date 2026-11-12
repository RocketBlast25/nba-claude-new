import { describe, expect, it } from 'vitest';
import { SIM_CONFIG } from '../../../src/sim/background/config';
import { simulateGame, teamPossessions, playerMinutes, type SimTeam } from '../../../src/sim/background/gameSim';
import { SeededRng } from '../../../src/sim/core/random';
import { makeId, type TeamId } from '../../../src/sim/core/types';
import { generateRoster } from '../../../src/sim/league/roster';
import { buildSchedule, GAMES_PER_TEAM, type ScheduleTeam } from '../../../src/sim/league/schedule';
import { computeStandings, sortStandings } from '../../../src/sim/league/standings';
import { simulateSeason } from '../../../src/sim/league/season';

/** Builds a league of `count` teams in two conferences, each with a division. */
function makeLeague(count: number, seed: number): (ScheduleTeam & { sim: SimTeam })[] {
  const rng = new SeededRng(seed);
  return Array.from({ length: count }, (_, i) => {
    const id = makeId<'team'>(`T${i + 1}`) as TeamId;
    const conference = i < count / 2 ? 'East' : 'West';
    const division = `${conference}-${Math.floor(i / 5) % 3}`;
    const roster = generateRoster(id, 10, rng.fork());
    return {
      id,
      conference,
      division,
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

describe('team possessions (TR-background-sim-001)', () => {
  const team = makeLeague(2, 1)[0]!.sim;
  const opp = makeLeague(2, 2)[1]!.sim;

  it('scales with minutes and adds possessions in overtime', () => {
    const reg = teamPossessions(team, opp, 48);
    const ot = teamPossessions(team, opp, SIM_CONFIG.overtimeMinutes);
    expect(reg).toBeGreaterThan(ot);
    expect(ot).toBeGreaterThan(0);
  });
});

describe('minutes adjustments (TR-background-sim-004)', () => {
  const player = { id: makeId<'player'>('x'), attributes: {} as never, stamina: 100, usage: 1 };
  it('reduces minutes for low stamina and foul trouble', () => {
    expect(playerMinutes({ ...player, stamina: 50 }, 0, 30)).toBeLessThan(30);
    expect(playerMinutes(player, 5, 30)).toBeLessThan(30);
    expect(playerMinutes(player, 0, 30)).toBe(30);
  });
});

describe('box score integrity (TR-background-sim-005)', () => {
  it('keeps every count an integer and player totals equal team totals', () => {
    const [a, b] = makeLeague(2, 9);
    const result = simulateGame(makeId<'game'>('g1'), a!.sim, b!.sim, new SeededRng(3));
    for (const side of [result.home, result.away]) {
      const sumPoints = side.boxScores.reduce((s, bs) => s + bs.points, 0);
      const sumFgm = side.boxScores.reduce((s, bs) => s + bs.fgm, 0);
      const sumFga = side.boxScores.reduce((s, bs) => s + bs.fga, 0);
      expect(sumPoints).toBe(side.points);
      expect(sumFgm).toBe(side.fgm);
      expect(sumFga).toBe(side.fga);
      for (const bs of side.boxScores) {
        for (const v of [bs.points, bs.fgm, bs.fga, bs.assists, bs.minutes]) {
          expect(Number.isInteger(v)).toBe(true);
        }
      }
    }
    expect(result.home.points).not.toBe(result.away.points);
  });

  it('sums every new counting stat from players to team totals as integers', () => {
    const [a, b] = makeLeague(2, 17);
    const result = simulateGame(makeId<'game'>('g2'), a!.sim, b!.sim, new SeededRng(5));
    for (const side of [result.home, result.away]) {
      for (const k of ['threePm', 'threePa', 'ftm', 'fta', 'rebounds', 'steals', 'blocks', 'turnovers', 'fouls'] as const) {
        const sum = side.boxScores.reduce((s, bs) => s + bs[k], 0);
        expect(Number.isInteger(sum)).toBe(true);
        for (const bs of side.boxScores) expect(Number.isInteger(bs[k])).toBe(true);
      }
      const threePm = side.boxScores.reduce((s, bs) => s + bs.threePm, 0);
      const threePa = side.boxScores.reduce((s, bs) => s + bs.threePa, 0);
      const fgm = side.boxScores.reduce((s, bs) => s + bs.fgm, 0);
      expect(threePm).toBeLessThanOrEqual(fgm);
      expect(threePm).toBeLessThanOrEqual(threePa);
    }
  });
});

describe('season aggregation (Milestone 5, Item 4)', () => {
  it('gives each player per-game averages equal to totals divided by games played', () => {
    const season = simulateSeason(makeLeague(30, 33), new SeededRng(77));
    expect(season.playerSeasons.length).toBeGreaterThan(0);
    for (const line of season.playerSeasons) {
      expect(line.gamesPlayed).toBeGreaterThan(0);
      expect(line.gamesPlayed).toBeLessThanOrEqual(season.gamesPlayed * 2);
      expect(line.averages.points).toBeCloseTo(line.totals.points / line.gamesPlayed, 9);
      expect(line.averages.rebounds).toBeCloseTo(line.totals.rebounds / line.gamesPlayed, 9);
      expect(Number.isInteger(line.totals.threePm)).toBe(true);
    }
  });
});

describe('schedule (82 games per team)', () => {
  it('gives every team exactly 82 games and never pairs a team with itself', () => {
    const league = makeLeague(30, 4);
    const games = buildSchedule(league, new SeededRng(11));
    expect(games.length).toBe((30 * GAMES_PER_TEAM) / 2);
    const counts = new Map<string, number>();
    for (const g of games) {
      expect(g.homeId).not.toBe(g.awayId);
      counts.set(g.homeId, (counts.get(g.homeId) ?? 0) + 1);
      counts.set(g.awayId, (counts.get(g.awayId) ?? 0) + 1);
    }
    for (const t of league) expect(counts.get(t.id)).toBe(GAMES_PER_TEAM);
  });
});

describe('standings (win% with head-to-head tiebreak)', () => {
  it('sorts by win%, then head-to-head, then id', () => {
    const a = makeId<'team'>('A');
    const b = makeId<'team'>('B');
    const c = makeId<'team'>('C');
    // A and B both 1-1; A beat B head-to-head.
    const games = [
      { homeId: a, awayId: b, homeWon: true },
      { homeId: c, awayId: a, homeWon: true },
      { homeId: b, awayId: c, homeWon: true },
    ];
    const rows = computeStandings(
      [{ id: a, conference: 'East' }, { id: b, conference: 'East' }, { id: c, conference: 'East' }],
      games,
    );
    const sorted = sortStandings(rows, games).map((r) => r.teamId);
    expect(sorted.indexOf(a)).toBeLessThan(sorted.indexOf(b));
  });
});

describe('seasons: determinism and league averages (TR-background-sim-007)', () => {
  it('is deterministic for a given seed', () => {
    const run = () => simulateSeason(makeLeague(30, 21), new SeededRng(99));
    const x = run();
    const y = run();
    expect(x.standings).toEqual(y.standings);
    expect(x.totalPoints).toBe(y.totalPoints);
  });

  it('keeps league-average points and FG% within configured bounds over several seasons', () => {
    const [minPts, maxPts] = SIM_CONFIG.bounds.pointsPerTeamGame;
    const [minFg, maxFg] = SIM_CONFIG.bounds.fgPct;
    for (let s = 1; s <= 3; s++) {
      const season = simulateSeason(makeLeague(30, s), new SeededRng(s * 1000));
      const teamGames = season.gamesPlayed * 2;
      const ppg = season.totalPoints / teamGames;
      const fg = season.totalFgm / season.totalFga;
      expect(ppg).toBeGreaterThanOrEqual(minPts);
      expect(ppg).toBeLessThanOrEqual(maxPts);
      expect(fg).toBeGreaterThanOrEqual(minFg);
      expect(fg).toBeLessThanOrEqual(maxFg);
    }
  });

  it('keeps rebounds, steals, blocks, turnovers and 3PT/FT percentages within sanity bounds over several seasons', () => {
    const [minReb, maxReb] = SIM_CONFIG.bounds.reboundsPerTeamGame;
    const [minStl, maxStl] = SIM_CONFIG.bounds.stealsPerTeamGame;
    const [minBlk, maxBlk] = SIM_CONFIG.bounds.blocksPerTeamGame;
    const [minTov, maxTov] = SIM_CONFIG.bounds.turnoversPerTeamGame;
    const [min3p, max3p] = SIM_CONFIG.bounds.threePct;
    const [minFt, maxFt] = SIM_CONFIG.bounds.ftPct;
    for (let s = 1; s <= 3; s++) {
      const season = simulateSeason(makeLeague(30, s), new SeededRng(s * 1000));
      const teamGames = season.gamesPlayed * 2;
      const perTeam = (k: 'rebounds' | 'steals' | 'blocks' | 'turnovers') =>
        season.playerSeasons.reduce((sum, p) => sum + p.totals[k], 0) / teamGames;
      const threePct = season.playerSeasons.reduce((s2, p) => s2 + p.totals.threePm, 0) / season.playerSeasons.reduce((s2, p) => s2 + p.totals.threePa, 0);
      const ftPct = season.playerSeasons.reduce((s2, p) => s2 + p.totals.ftm, 0) / season.playerSeasons.reduce((s2, p) => s2 + p.totals.fta, 0);
      expect(perTeam('rebounds')).toBeGreaterThanOrEqual(minReb);
      expect(perTeam('rebounds')).toBeLessThanOrEqual(maxReb);
      expect(perTeam('steals')).toBeGreaterThanOrEqual(minStl);
      expect(perTeam('steals')).toBeLessThanOrEqual(maxStl);
      expect(perTeam('blocks')).toBeGreaterThanOrEqual(minBlk);
      expect(perTeam('blocks')).toBeLessThanOrEqual(maxBlk);
      expect(perTeam('turnovers')).toBeGreaterThanOrEqual(minTov);
      expect(perTeam('turnovers')).toBeLessThanOrEqual(maxTov);
      expect(threePct).toBeGreaterThanOrEqual(min3p);
      expect(threePct).toBeLessThanOrEqual(max3p);
      expect(ftPct).toBeGreaterThanOrEqual(minFt);
      expect(ftPct).toBeLessThanOrEqual(maxFt);
    }
  });
});
