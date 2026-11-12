import { describe, expect, it } from 'vitest';
import {
  ACTION_IDS,
  ACTION_RULES,
  decide,
  decisionCards,
  isActionId,
  successChance,
} from '../../../src/possession/decision';
import { createPossession } from '../../../src/possession/engine';
import type { Attributes } from '../../../src/sim/core/models';
import { SeededRng } from '../../../src/sim/core/random';

const average: Attributes = {
  finishing: 60, closeShot: 60, midRange: 60, threePoint: 60, freeThrow: 60,
  ballHandling: 60, passing: 60, basketballIQ: 60, perimeterDefense: 60,
  interiorDefense: 60, rebounding: 60, speed: 60, strength: 60, stamina: 60,
};

const elite: Attributes = { ...average, ballHandling: 99, midRange: 99, passing: 99, basketballIQ: 99 };
const weak: Attributes = { ...average, ballHandling: 25, midRange: 25, passing: 25, basketballIQ: 25 };

/** A possession bound to an actor with the given attributes and seed. */
function stateWith(attributes: Attributes, seed = 1) {
  return createPossession([], { attributes, rng: new SeededRng(seed) });
}

describe('decision rules: attribute-driven success chance', () => {
  it('gives the base chance for an average (60) attribute', () => {
    expect(successChance(ACTION_RULES.drive, average)).toBeCloseTo(0.5, 9);
  });

  it('rises with a higher attribute and falls with a lower one', () => {
    expect(successChance(ACTION_RULES.pull_up, elite)).toBeGreaterThan(
      successChance(ACTION_RULES.pull_up, average),
    );
    expect(successChance(ACTION_RULES.pull_up, weak)).toBeLessThan(
      successChance(ACTION_RULES.pull_up, average),
    );
  });

  it('clamps every chance into the rule min..max range', () => {
    for (const id of ACTION_IDS) {
      const rule = ACTION_RULES[id];
      for (const attrs of [elite, weak]) {
        const c = successChance(rule, attrs);
        expect(c).toBeGreaterThanOrEqual(rule.min);
        expect(c).toBeLessThanOrEqual(rule.max);
      }
    }
  });
});

describe('decision cards', () => {
  it('shows all four tactical choices with a live success % each', () => {
    const cards = decisionCards(average);
    expect(Object.keys(cards).sort()).toEqual(['drive', 'pass', 'pull_up', 'reset']);
    for (const id of ACTION_IDS) {
      expect(cards[id]).toBeCloseTo(successChance(ACTION_RULES[id], average), 12);
    }
  });

  it('has a non-empty display name for each action', () => {
    for (const id of ACTION_IDS) {
      expect(ACTION_RULES[id].name.length).toBeGreaterThan(0);
    }
  });
});

describe('decide(state, actionId)', () => {
  it('is deterministic: the same seed and action give the same outcome', () => {
    const a = decide(stateWith(average, 42), 'drive').outcome;
    const b = decide(stateWith(average, 42), 'drive').outcome;
    expect(a).toEqual(b);
  });

  it('leaves the possession fields unchanged, apart from the actor RNG position', () => {
    const start = stateWith(average, 5);
    const before = { timeMs: start.timeMs, tick: start.tick, paused: start.paused, entities: start.entities, attributes: start.actor?.attributes };
    const rngBefore = start.actor?.rng;
    decide(start, 'pass');
    expect({ timeMs: start.timeMs, tick: start.tick, paused: start.paused, entities: start.entities, attributes: start.actor?.attributes }).toEqual(before);
    // The RNG is a mutable object, so its position advances in place.
    expect(start.actor?.rng).toBe(rngBefore);
  });

  it('reports the chance it rolled against and pays reward only on success', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { outcome } = decide(stateWith(average, seed), 'pull_up');
      expect(outcome.successChance).toBeCloseTo(successChance(ACTION_RULES.pull_up, average), 12);
      expect(outcome.reward).toBe(outcome.success ? ACTION_RULES.pull_up.reward : 0);
    }
  });

  it('succeeds more often for an elite actor than a weak one over many rolls', () => {
    const count = (attrs: Attributes) => {
      const state = stateWith(attrs, 7);
      let wins = 0;
      for (let i = 0; i < 5000; i++) {
        if (decide(state, 'pass').outcome.success) wins++;
      }
      return wins;
    };
    expect(count(elite)).toBeGreaterThan(count(weak));
  });

  it('rejects an unknown action id', () => {
    expect(() => decide(stateWith(average), 'dunk' as never)).toThrow(RangeError);
  });

  it('rejects a state with no actor bound', () => {
    expect(() => decide(createPossession([]), 'drive')).toThrow(RangeError);
  });
});

describe('isActionId', () => {
  it('accepts the four ids and rejects anything else', () => {
    for (const id of ACTION_IDS) expect(isActionId(id)).toBe(true);
    expect(isActionId('shoot')).toBe(false);
    expect(isActionId(undefined)).toBe(false);
  });
});
