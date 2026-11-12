import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../../src/sim/core/random';
import { makeId, type TeamId } from '../../../src/sim/core/types';
import type { StandingRow } from '../../../src/sim/league/standings';
import { runPlayoffs } from '../../../src/sim/league/playoffs';

function row(i: number, conference: 'East' | 'West', wins: number): StandingRow {
  return {
    teamId: makeId<'team'>(`T${String(i).padStart(2, '0')}`) as TeamId,
    conference,
    wins,
    losses: 82 - wins,
  } as StandingRow;
}

// 15 teams per conference, wins descending so seed 1 is the best record.
const standings: StandingRow[] = [];
for (let i = 0; i < 15; i++) standings.push(row(i + 1, 'East', 60 - i));
for (let i = 0; i < 15; i++) standings.push(row(i + 16, 'West', 58 - i));

describe('runPlayoffs exitOrder', () => {
  // Home team always wins, so the bracket is fully deterministic. The higher seed hosts.
  const higherSeedWins = (_home: TeamId, _away: TeamId, _rng: SeededRng): boolean => true;

  it('contains exactly the 16 bracket teams, with no duplicates', () => {
    const result = runPlayoffs(standings, higherSeedWins, new SeededRng(1));
    expect(result.exitOrder).toHaveLength(16);
    expect(new Set(result.exitOrder).size).toBe(16);
  });

  it('puts the champion last and the runner-up 15th', () => {
    const result = runPlayoffs(standings, higherSeedWins, new SeededRng(1));
    expect(result.exitOrder[15]).toBe(result.champion);
    expect(result.exitOrder[14]).toBe(result.runnerUp);
  });

  it('excludes play-in losers: exitOrder is exactly the 16 bracket teams', () => {
    const result = runPlayoffs(standings, higherSeedWins, new SeededRng(1));
    const bracket = new Set(result.exitOrder);
    // 30 teams, 16 in the bracket, 14 not. The 14 non-bracket teams include the 4 play-in losers.
    const nonBracket = standings.filter((r) => !bracket.has(r.teamId));
    expect(nonBracket).toHaveLength(14);
    // Every bracket team appears in exactly one round as a participant.
    const participants = new Set(result.rounds[0]!.flatMap((s) => [s.higherSeed, s.lowerSeed]));
    expect(participants.size).toBe(8 * 2);
    for (const t of participants) expect(bracket.has(t)).toBe(true);
  });

  it('orders round-1 losers before later-round losers', () => {
    const result = runPlayoffs(standings, higherSeedWins, new SeededRng(1));
    const round1Losers = new Set(
      result.rounds[0]!.map((s) => (s.winner === s.higherSeed ? s.lowerSeed : s.higherSeed)),
    );
    const firstEight = result.exitOrder.slice(0, 8);
    for (const t of firstEight) expect(round1Losers.has(t)).toBe(true);
  });

  it('is deterministic for the same seed and standings', () => {
    const a = runPlayoffs(standings, higherSeedWins, new SeededRng(9));
    const b = runPlayoffs(standings, higherSeedWins, new SeededRng(9));
    expect(a.exitOrder).toEqual(b.exitOrder);
  });
});
