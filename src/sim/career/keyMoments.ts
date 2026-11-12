import type { Player } from '../core/models';
import type { SeededRng } from '../core/random';
import { createPossession } from '../../possession/engine';
import { ACTION_IDS, decide, decisionCards, type ActionId } from '../../possession/decision';
import { CAREER_CONFIG } from './careerConfig';
import type { KeyMoment, KeyMomentResult } from './types';

/**
 * Selects Key Moments for one game. User-team games get 2-4 moments; AI games get
 * at most 1. Moments are drawn from the seeded RNG, so the same seed gives the same set.
 */
export function selectMoments(
  gameId: string,
  season: number,
  userControlled: boolean,
  actors: Player[],
  rng: SeededRng,
): KeyMoment[] {
  const cfg = CAREER_CONFIG.keyMoments;
  if (actors.length === 0) return [];
  const count = userControlled ? rng.int(cfg.userGameMin, cfg.userGameMax) : rng.int(0, cfg.aiGameMax);
  const moments: KeyMoment[] = [];
  for (let i = 0; i < count; i++) {
    const actor = rng.pick(actors);
    moments.push({
      gameId,
      season,
      quarter: (rng.int(1, 4) as 1 | 2 | 3 | 4),
      clockSec: rng.int(0, 719),
      userControlled,
      actorId: actor.id,
      attributes: actor.attributes,
    });
  }
  return moments;
}

/**
 * Resolves one moment. User moments call chooseAction for the choice; AI moments
 * pick the action with the highest live success chance (ties go to the earlier
 * action in ACTION_IDS). The result comes from decide(), so the roll uses the
 * actor's seeded RNG and is deterministic for a given seed.
 */
export function resolveMoment(
  moment: KeyMoment,
  rng: SeededRng,
  chooseAction?: (moment: KeyMoment) => ActionId,
): KeyMomentResult {
  const cards = decisionCards(moment.attributes);
  const actionId: ActionId = moment.userControlled
    ? (chooseAction ? chooseAction(moment) : bestAction(cards))
    : bestAction(cards);
  const state = createPossession([], { attributes: moment.attributes, rng });
  const { outcome } = decide(state, actionId);
  return { moment, actionId, success: outcome.success, reward: outcome.reward };
}

/** Highest success chance first; ties keep the order of ACTION_IDS. */
export function bestAction(cards: Record<ActionId, number>): ActionId {
  let best: ActionId = ACTION_IDS[0] as ActionId;
  for (const id of ACTION_IDS) {
    if (cards[id] > cards[best]) best = id;
  }
  return best;
}
