import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../../src/sim/core/random';
import { generateRoster } from '../../../src/sim/league/roster';
import { makeId, type TeamId } from '../../../src/sim/core/types';
import { ACTION_IDS, decisionCards, type ActionId } from '../../../src/possession/decision';
import { bestAction, momentCourtOf, resolveMoment, selectMoments } from '../../../src/sim/career/keyMoments';
import { CAREER_CONFIG } from '../../../src/sim/career/careerConfig';

const roster = generateRoster(makeId<'team'>('T01') as TeamId, 1, new SeededRng(13));
const cfg = CAREER_CONFIG.keyMoments;

describe('selectMoments', () => {
  it('gives user-team games 2-4 moments', () => {
    for (let s = 0; s < 50; s++) {
      const m = selectMoments('g', 1, true, roster, new SeededRng(s));
      expect(m.length).toBeGreaterThanOrEqual(cfg.userGameMin);
      expect(m.length).toBeLessThanOrEqual(cfg.userGameMax);
      expect(m.every((x) => x.userControlled)).toBe(true);
    }
  });

  it('gives AI games at most one moment', () => {
    for (let s = 0; s < 50; s++) {
      const m = selectMoments('g', 1, false, roster, new SeededRng(s));
      expect(m.length).toBeLessThanOrEqual(cfg.aiGameMax);
      expect(m.every((x) => !x.userControlled)).toBe(true);
    }
  });

  it('returns no moments when there are no actors', () => {
    expect(selectMoments('g', 1, true, [], new SeededRng(1))).toEqual([]);
  });

  it('is deterministic for the same seed', () => {
    expect(selectMoments('g', 1, true, roster, new SeededRng(4))).toEqual(
      selectMoments('g', 1, true, roster, new SeededRng(4)),
    );
  });
});

describe('momentCourtOf', () => {
  it('builds the court from the career rosters with the actor first', () => {
    const actor = roster[0]!;
    const career = {
      players: roster,
      rosters: { T01: roster.slice(0, 8).map((p) => p.id), T02: roster.slice(8, 13).map((p) => p.id) },
      userTeamId: 'T01',
    };
    const moment = {
      gameId: 'g',
      season: 1,
      quarter: 1 as const,
      clockSec: 1,
      userControlled: true,
      actorId: actor.id,
      attributes: actor.attributes,
    };
    const court = momentCourtOf(career, moment);
    expect(court.actor.id).toBe(actor.id);
    expect(court.offense.every((p) => p.id !== actor.id)).toBe(true);
    expect(court.offense.length).toBeLessThanOrEqual(4);
    expect(court.defense.length).toBeLessThanOrEqual(5);
    expect(court.defenseTeamId).toBe('T02');
  });
});

describe('bestAction', () => {
  it('picks the highest success chance and breaks ties by ACTION_IDS order', () => {
    const cards = Object.fromEntries(ACTION_IDS.map((id) => [id, 0.5])) as Record<ActionId, number>;
    expect(bestAction(cards)).toBe(ACTION_IDS[0]);
    cards[ACTION_IDS[2] as ActionId] = 0.9;
    expect(bestAction(cards)).toBe(ACTION_IDS[2]);
  });
});

describe('resolveMoment', () => {
  const actor = roster[0]!;
  const court = {
    actor,
    offense: roster.slice(1, 5),
    defense: roster.slice(5, 10),
    offenseTeamId: makeId<'team'>('T01') as TeamId,
    defenseTeamId: makeId<'team'>('T02') as TeamId,
  };
  const moment = {
    gameId: 'g',
    season: 1,
    quarter: 1 as const,
    clockSec: 100,
    userControlled: false,
    actorId: actor.id,
    attributes: actor.attributes,
  };

  it('auto-resolves AI moments to the best decision card without calling choose', () => {
    let called = false;
    const res = resolveMoment({ ...moment, userControlled: false }, court, new SeededRng(3), () => {
      called = true;
      return { actionId: ACTION_IDS[0] as ActionId };
    });
    expect(called).toBe(false);
    expect(res.actionId).toBe(bestAction(decisionCards(moment.attributes)));
  });

  it('uses the chosen play and modifier for user-controlled moments', () => {
    const chosen = ACTION_IDS[1] as ActionId;
    const choose = () => ({ actionId: chosen, modifier: { multiplier: 1, bonus: 0 } });
    const res = resolveMoment({ ...moment, userControlled: true }, court, new SeededRng(3), choose);
    expect(res.actionId).toBe(chosen);
  });

  it('applies the chosen modifier: a zero chance modifier always fails the play', () => {
    const chosen = ACTION_IDS[1] as ActionId;
    const choose = () => ({ actionId: chosen, modifier: { multiplier: 0, bonus: 0 } });
    for (let s = 0; s < 20; s++) {
      const res = resolveMoment({ ...moment, userControlled: true }, court, new SeededRng(s), choose);
      expect(res.success).toBe(false);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = resolveMoment({ ...moment, userControlled: false }, court, new SeededRng(8));
    const b = resolveMoment({ ...moment, userControlled: false }, court, new SeededRng(8));
    expect(a).toEqual(b);
  });
});
