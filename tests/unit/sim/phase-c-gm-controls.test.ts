import { describe, expect, it } from 'vitest';
import type { Player } from '../../../src/sim/core/models';
import { makeId } from '../../../src/sim/core/types';
import { checkTrade, salaryMatchesFor } from '../../../src/sim/league/trade';
import { checkRotation, moveInRotation, startersOf } from '../../../src/sim/league/rotation';
import { evaluateOffer } from '../../../src/sim/league/freeAgentOffer';
import { LEAGUE_CONFIG } from '../../../src/sim/league/leagueConfig';

function player(id: string, salary: number, overall = 60): Player {
  return {
    id: makeId<'player'>(id),
    name: id,
    age: 25,
    position: 'PG',
    heightIn: 75,
    attributes: {
      finishing: 60, closeShot: 60, midRange: 60, threePoint: 60, freeThrow: 60,
      ballHandling: 60, passing: 60, basketballIQ: 60, perimeterDefense: 60,
      interiorDefense: 60, rebounding: 60, speed: 60, strength: 60, stamina: 60,
    },
    badges: [],
    overall,
    potential: overall,
    stamina: 100,
    contract: { salary, yearsLeft: 2, type: 'standard' },
  };
}

describe('salary matching (125% plus buffer)', () => {
  it('allows incoming salary up to 125% of outgoing plus the buffer', () => {
    const { incomingRatio, buffer } = LEAGUE_CONFIG.trade;
    const outgoing = 10000;
    const limit = outgoing * incomingRatio + buffer;
    expect(salaryMatchesFor(outgoing, limit).ok).toBe(true);
    expect(salaryMatchesFor(outgoing, limit + 1).ok).toBe(false);
  });

  it('always allows a side that receives less salary than it sends', () => {
    expect(salaryMatchesFor(20000, 5000).ok).toBe(true);
  });

  it('rejects a trade where one side takes back too much salary', () => {
    const result = checkTrade({
      sendA: [player('a1', 10000)],
      sendB: [player('b1', 20000)],
      rosterA: 13,
      rosterB: 13,
    });
    expect(result.ok).toBe(false);
  });

  it('accepts a balanced trade within the roster limit', () => {
    const result = checkTrade({
      sendA: [player('a1', 10000)],
      sendB: [player('b1', 11000)],
      rosterA: 13,
      rosterB: 13,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a trade that would push a roster over the limit', () => {
    const result = checkTrade({
      sendA: [player('a1', 5000)],
      sendB: [player('b1', 5000), player('b2', 5000)],
      rosterA: LEAGUE_CONFIG.maxRosterSize,
      rosterB: 13,
    });
    expect(result.ok).toBe(false);
  });
});

describe('rotation editor', () => {
  const roster = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'].map((id) => makeId<'player'>(id));

  it('accepts a valid rotation drawn from the roster', () => {
    expect(checkRotation(roster.slice(0, 7), roster).ok).toBe(true);
  });

  it('rejects duplicate players and non-roster players', () => {
    expect(checkRotation([roster[0]!, roster[0]!, roster[1]!, roster[2]!, roster[3]!], roster).ok).toBe(false);
    expect(checkRotation([...roster.slice(0, 4), makeId<'player'>('ghost')], roster).ok).toBe(false);
  });

  it('requires at least the starter count and at most the rotation limit', () => {
    expect(checkRotation(roster.slice(0, 4), roster).ok).toBe(false);
    const big = Array.from({ length: LEAGUE_CONFIG.rotation.maxPlayed + 1 }, (_, i) => makeId<'player'>(`x${i}`));
    expect(checkRotation(big, big).ok).toBe(false);
  });

  it('takes the first five players as starters and moves players in order', () => {
    expect(startersOf({ playerIds: roster })).toEqual(roster.slice(0, 5));
    const moved = moveInRotation(roster, 5, 0);
    expect(moved[0]).toBe(roster[5]);
    expect(moved).toHaveLength(roster.length);
  });
});

describe('free-agent offers', () => {
  it('signs a free agent when there is cap space and a roster spot', () => {
    const fa = player('fa1', 0, 60);
    const result = evaluateOffer({ player: fa, roster: [player('r1', 10000)] });
    expect(result.ok).toBe(true);
  });

  it('rejects an offer that exceeds cap space', () => {
    const fa = player('fa1', 0, 80);
    const roster = [player('big', LEAGUE_CONFIG.cap.salaryCap)];
    expect(evaluateOffer({ player: fa, roster }).ok).toBe(false);
  });

  it('rejects an offer when the roster is full', () => {
    const roster = Array.from({ length: LEAGUE_CONFIG.maxRosterSize }, (_, i) => player(`r${i}`, 1000));
    expect(evaluateOffer({ player: player('fa1', 0), roster }).ok).toBe(false);
  });
});
