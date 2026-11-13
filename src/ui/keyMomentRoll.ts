/**
 * The Key Moment possession roll, kept pure and separate from the modal so the
 * mapping from an action choice to a success/reward is testable on its own.
 */
import { decide, type ActionId } from '../possession/decision';
import { createPossession } from '../possession/engine';
import type { Attributes } from '../sim/core/models';
import { SeededRng } from '../sim/core/random';

export interface RollOutcome {
  success: boolean;
  reward: number;
}

/** Rolls one action with a deterministic seed. The same choice and seed always agree. */
export function createRoll(actionId: ActionId, attributes: Attributes, rollSeed: number): RollOutcome {
  const state = createPossession([], { attributes, rng: new SeededRng(rollSeed) });
  const { outcome } = decide(state, actionId);
  return { success: outcome.success, reward: outcome.reward };
}
