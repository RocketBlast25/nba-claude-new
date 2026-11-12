import type { Attributes, AttributeKey } from '../sim/core/models';
import type { PossessionState } from './types';

/** The four tactical choices shown as decision cards (GDD section 3). */
export type ActionId = 'drive' | 'pull_up' | 'pass' | 'reset';

export const ACTION_IDS: readonly ActionId[] = ['drive', 'pull_up', 'pass', 'reset'];

/**
 * Data-driven decision rules. Success % = base + (attribute - 60) * weight,
 * clamped to [min, max]. Weights and bases are assumptions pending design sign-off.
 */
export interface ActionRule {
  id: ActionId;
  name: string;
  attribute: AttributeKey;
  base: number;
  weight: number;
  min: number;
  max: number;
  /** Reward multiplier applied to a successful outcome (risk/reward line). */
  reward: number;
}

export const ACTION_RULES: Record<ActionId, ActionRule> = {
  drive: { id: 'drive', name: 'Drive', attribute: 'ballHandling', base: 0.5, weight: 0.005, min: 0.1, max: 0.9, reward: 2 },
  pull_up: { id: 'pull_up', name: 'Pull-up', attribute: 'midRange', base: 0.4, weight: 0.006, min: 0.1, max: 0.9, reward: 2 },
  pass: { id: 'pass', name: 'Pass', attribute: 'passing', base: 0.6, weight: 0.005, min: 0.1, max: 0.95, reward: 1 },
  reset: { id: 'reset', name: 'Reset', attribute: 'basketballIQ', base: 0.8, weight: 0.002, min: 0.5, max: 0.98, reward: 0.5 },
};

export interface DecisionOutcome {
  actionId: ActionId;
  successChance: number;
  success: boolean;
  reward: number;
}

/** Live success % for an action, from the actor's attributes. Pure. */
export function successChance(rule: ActionRule, attributes: Attributes): number {
  const raw = rule.base + (attributes[rule.attribute] - 60) * rule.weight;
  return Math.min(rule.max, Math.max(rule.min, raw));
}

/** Map of every action id to its live success %, for rendering the cards. */
export function decisionCards(attributes: Attributes): Record<ActionId, number> {
  return {
    drive: successChance(ACTION_RULES.drive, attributes),
    pull_up: successChance(ACTION_RULES.pull_up, attributes),
    pass: successChance(ACTION_RULES.pass, attributes),
    reset: successChance(ACTION_RULES.reset, attributes),
  };
}

/** Narrows an unknown value to a known action id. */
export function isActionId(value: unknown): value is ActionId {
  return typeof value === 'string' && (ACTION_IDS as readonly string[]).includes(value);
}

/**
 * Resolves a decision card for the actor bound to the state. Rolls once against
 * the success chance. The actor's SeededRng is a mutable object, so its position
 * advances in place; the other state fields are returned as given. The state
 * stays paused until the caller resumes it.
 */
export function decide(
  state: PossessionState,
  actionId: ActionId,
): { state: PossessionState; outcome: DecisionOutcome } {
  if (!isActionId(actionId)) {
    throw new RangeError(`decide(): unknown action '${String(actionId)}'`);
  }
  if (state.actor === null) {
    throw new RangeError('decide(): state has no actor; create the possession with one');
  }
  const rule = ACTION_RULES[actionId];
  const chance = successChance(rule, state.actor.attributes);
  const success = state.actor.rng.chance(chance);
  return {
    state,
    outcome: {
      actionId,
      successChance: chance,
      success,
      reward: success ? rule.reward : 0,
    },
  };
}
