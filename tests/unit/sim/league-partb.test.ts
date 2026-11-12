import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../../src/sim/core/random';
import { makeId, type TeamId } from '../../../src/sim/core/types';
import type { StandingRow } from '../../../src/sim/league/standings';
import { LEAGUE_CONFIG } from '../../../src/sim/league/leagueConfig';
import { runPlayIn, playSeries, runPlayoffs, seedConference, type GameRunner } from '../../../src/sim/league/playoffs';
import { buildDraftOrder, drawLottery } from '../../../src/sim/league/draft';
import { generateProspectClass } from '../../../src/sim/league/prospects';
import { luxuryTax, payrollOf, capSpace, salaryForOverall, rookieSalary } from '../../../src/sim/league/economy';
import { advanceTeamOffseason, signFreeAgents, tickContracts } from '../../../src/sim/league/offseason';
import type { Player } from '../../../src/sim/core/models';

const team = (n: number): TeamId => makeId<'team'>(`T${String(n).padStart(2, '0')}`);

/** 30 teams: 15 East (T00-T14) and 15 West (T15-T29), with wins descending by index. */
function standings30(): StandingRow[] {
  return Array.from({ length: 30 }, (_, i) => ({
    teamId: team(i),
    conference: i < 15 ? 'East' : 'West',
    wins: 60 - i,
    losses: 22 + i,
  })) as StandingRow[];
}

/** Higher seed (lower index in the sorted pair) always wins; deterministic. */
const higherWins: GameRunner = (home, away) => home < away;

describe('playoffs', () => {
  it('seeds each conference by record with a stable id tiebreak', () => {
    const seeds = seedConference(standings30(), 'East');
    expect(seeds).toHaveLength(15);
    expect(seeds[0]).toBe(team(0));
    expect(seeds[14]).toBe(team(14));
  });

  it('play-in: 7/8 winner takes 7th, 8th comes from the loser of 7/8 vs 9/10 winner', () => {
    const seeds = Array.from({ length: 10 }, (_, i) => team(i));
    const result = runPlayIn(seeds, higherWins, new SeededRng(1));
    expect(result.games).toHaveLength(3);
    expect(result.playoffSeeds).toHaveLength(8);
    expect(new Set(result.playoffSeeds).size).toBe(8);
    expect(result.playoffSeeds[6]).toBe(team(6));
    // Lower id wins in higherWins: T07 beats T08 for the 8th seed.
    expect(result.playoffSeeds[7]).toBe(team(7));
  });

  it('best-of-7 uses the 2-2-1-1-1 home pattern and stops at four wins', () => {
    // Home team always wins, so the series runs all seven games and exposes the pattern.
    const seen: boolean[] = [];
    const runner: GameRunner = (home) => {
      seen.push(home === team(0));
      return true;
    };
    const series = playSeries(team(0), team(1), runner, new SeededRng(2));
    expect(seen).toEqual([true, true, false, false, true, false, true]);
    expect(series.higherSeedWins).toBe(4);
    expect(series.lowerSeedWins).toBe(3);
    expect(series.winner).toBe(team(0));
  });

  it('full playoff bracket is deterministic for the same seed', () => {
    const a = runPlayoffs(standings30(), higherWins, new SeededRng(7));
    const b = runPlayoffs(standings30(), higherWins, new SeededRng(7));
    expect(a.champion).toBe(b.champion);
    expect(a.rounds.map((r) => r.length)).toEqual([8, 4, 2, 1]);
    expect(a.rounds.map((r) => r.map((s) => s.winner))).toEqual(b.rounds.map((r) => r.map((s) => s.winner)));
  });
});

describe('draft', () => {
  it('produces 30 picks with no duplicate teams', () => {
    const rows = standings30();
    const playoffTeams = seedConference(rows, 'East').slice(0, 8)
      .concat(seedConference(rows, 'West').slice(0, 8));
    const exit = [...playoffTeams];
    const order = buildDraftOrder(rows, playoffTeams, exit, new SeededRng(3));
    expect(order).toHaveLength(LEAGUE_CONFIG.draftRounds);
    expect(order.map((p) => p.pick)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(new Set(order.map((p) => p.teamId)).size).toBe(30);
  });

  it('lottery picks come from the 14 non-playoff teams and are unique', () => {
    const lotteryTeams = Array.from({ length: 14 }, (_, i) => team(i));
    const picks = drawLottery(lotteryTeams, new SeededRng(4));
    expect(picks).toHaveLength(4);
    expect(new Set(picks).size).toBe(4);
    for (const p of picks) expect(lotteryTeams).toContain(p);
  });

  it('lottery win frequency tracks the configured odds', () => {
    const lotteryTeams = Array.from({ length: 14 }, (_, i) => team(i));
    const trials = 20000;
    const firstCounts = new Map<TeamId, number>();
    const rng = new SeededRng(99);
    for (let i = 0; i < trials; i++) {
      const [first] = drawLottery(lotteryTeams, rng);
      firstCounts.set(first as TeamId, (firstCounts.get(first as TeamId) ?? 0) + 1);
    }
    const odds = LEAGUE_CONFIG.lotteryOdds;
    // team(0) is the worst record (highest odds); team(13) has the lowest odds.
    const worst = (firstCounts.get(team(0)) ?? 0) / trials;
    const last = (firstCounts.get(team(13)) ?? 0) / trials;
    expect(Math.abs(worst - odds[0] / 1000)).toBeLessThan(0.02);
    expect(Math.abs(last - odds[13] / 1000)).toBeLessThan(0.01);
  });

  it('prospect class has the requested size, unique ids and valid ratings', () => {
    const class1 = generateProspectClass('2026', 60, new SeededRng(5));
    expect(class1).toHaveLength(60);
    expect(new Set(class1.map((p) => p.id)).size).toBe(60);
    for (const p of class1) {
      expect(p.overall).toBeGreaterThanOrEqual(1);
      expect(p.overall).toBeLessThanOrEqual(99);
    }
  });
});

describe('economy', () => {
  it('salary scale is clamped and monotonic', () => {
    const { minimum, maximum } = LEAGUE_CONFIG.salary;
    expect(salaryForOverall(30)).toBe(minimum);
    expect(salaryForOverall(99)).toBe(maximum);
    expect(salaryForOverall(70)).toBeGreaterThan(salaryForOverall(60));
  });

  it('rookie scale slides from top pick to pick 30', () => {
    expect(rookieSalary(1)).toBe(LEAGUE_CONFIG.salary.rookieTop);
    expect(rookieSalary(30)).toBe(LEAGUE_CONFIG.salary.rookieFloor);
    expect(rookieSalary(10)).toBeLessThan(rookieSalary(9));
  });

  it('cap space and payroll math', () => {
    const cap = LEAGUE_CONFIG.cap.salaryCap;
    expect(payrollOf([1000, 2000, 3000])).toBe(6000);
    expect(capSpace(cap - 500)).toBe(500);
    expect(capSpace(cap + 500)).toBe(0);
  });

  it('luxury tax is zero at the line and applies the rate above it', () => {
    const line = LEAGUE_CONFIG.cap.luxuryTaxLine;
    const rate = LEAGUE_CONFIG.cap.luxuryTaxRate;
    expect(luxuryTax(line)).toBe(0);
    expect(luxuryTax(line - 1)).toBe(0);
    expect(luxuryTax(line + 10000)).toBe(Math.round(10000 * rate));
  });
});

function player(id: string, overall: number, yearsLeft: number): Player {
  return {
    id: makeId<'player'>(id),
    name: id,
    age: 27,
    position: 'SF',
    heightIn: 79,
    attributes: {} as Player['attributes'],
    badges: [],
    overall,
    potential: overall,
    stamina: 100,
    contract: { salary: 5000, yearsLeft, type: 'standard' },
  } as Player;
}

describe('offseason', () => {
  it('ticks contracts and separates expiring players', () => {
    const { active, expiring } = tickContracts([player('a', 70, 1), player('b', 60, 3)]);
    expect(expiring.map((p) => p.id)).toEqual([makeId('a')]);
    expect(active.map((p) => p.contract.yearsLeft)).toEqual([2]);
  });

  it('re-signs only players above the threshold, and only when cap space allows', () => {
    const roster = [player('star', 80, 1), player('bench', 45, 1), player('keep', 75, 3)];
    const { roster: next, freeAgents } = advanceTeamOffseason(roster, 60, new SeededRng(6));
    expect(freeAgents.map((p) => p.id)).toEqual([makeId('bench')]);
    expect(next.map((p) => p.id)).toContain(makeId('star'));
    expect(next.map((p) => p.id)).toContain(makeId('keep'));
    expect(next.find((p) => p.id === makeId('star'))?.contract.yearsLeft).toBeGreaterThanOrEqual(LEAGUE_CONFIG.contractYears.min);
  });

  it('free-agent signing is deterministic, best first, and stays under the cap', () => {
    const fas = [player('x', 70, 0), player('y', 85, 0), player('z', 60, 0)];
    const first = signFreeAgents(LEAGUE_CONFIG.cap.salaryCap - 2000, 10, fas, 3);
    const second = signFreeAgents(LEAGUE_CONFIG.cap.salaryCap - 2000, 10, fas, 3);
    expect(first.signed.map((p) => p.id)).toEqual(second.signed.map((p) => p.id));
    expect(first.payroll).toBeLessThanOrEqual(LEAGUE_CONFIG.cap.salaryCap);
    expect(first.signed.length + first.remaining.length).toBe(3);
  });

  it('free-agent signing never exceeds the max roster size', () => {
    const fas = Array.from({ length: 6 }, (_, i) => player(`fa${i}`, 60 + i, 0));
    const result = signFreeAgents(0, LEAGUE_CONFIG.maxRosterSize - 2, fas, 10);
    expect(result.signed).toHaveLength(2);
    expect(result.signed.map((p) => p.overall)).toEqual([65, 64]);
  });
});
