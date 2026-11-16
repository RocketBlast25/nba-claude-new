import type { Player } from '../core/models';
import type { SeededRng } from '../core/random';
import { ACTION_IDS, decisionCards, type ActionId } from '../../possession/decision';
import { runKeyMomentCourt, type KeyMomentCourtInput } from '../../possession/keyMomentCourt';
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
    const moment: KeyMoment = {
      gameId,
      season,
      quarter: (rng.int(1, 4) as 1 | 2 | 3 | 4),
      clockSec: rng.int(0, 719),
      userControlled,
      actorId: actor.id,
      attributes: actor.attributes,
    };
    moments.push(moment);
  }
  return moments;
}

/** The court players and team ids a moment is resolved on. */
export interface MomentCourt {
  actor: Player;
  offense: Player[];
  defense: Player[];
  offenseTeamId: KeyMomentCourtInput['offenseTeamId'];
  defenseTeamId: KeyMomentCourtInput['defenseTeamId'];
}

/** The play picked for a moment: the engine action and its situational modifier. */
export interface MomentChoice {
  actionId: ActionId;
  modifier?: { multiplier: number; bonus: number };
}

/**
 * Builds the court for a career moment: the actor, up to four teammates on the user's
 * team and up to five players from the opposing team. The opponent is found from the
 * career's rosters, so the defence uses real players. Players are read in roster order.
 */
export function momentCourtOf(
  career: { players: Player[]; rosters: Record<string, string[]>; userTeamId: string },
  moment: KeyMoment,
): MomentCourt {
  const byId = new Map(career.players.map((p) => [p.id, p]));
  const actor = byId.get(moment.actorId);
  if (!actor) throw new Error(`momentCourtOf: unknown actor '${moment.actorId}'`);
  const offenseTeamId = career.userTeamId as MomentCourt['offenseTeamId'];
  const offense = (career.rosters[offenseTeamId] ?? [])
    .map((id) => byId.get(id as Player['id']))
    .filter((p): p is Player => p !== undefined && p.id !== actor.id)
    .slice(0, 4);
  const defenseTeamId = (Object.keys(career.rosters).find((t) => t !== offenseTeamId) ?? offenseTeamId) as MomentCourt['defenseTeamId'];
  const defense = (career.rosters[defenseTeamId] ?? [])
    .map((id) => byId.get(id as Player['id']))
    .filter((p): p is Player => p !== undefined)
    .slice(0, 5);
  return { actor, offense, defense, offenseTeamId, defenseTeamId };
}

/**
 * Resolves one moment through the Key Moment court (runKeyMomentCourt / resolvePlay).
 * User moments use the given choice. AI moments take the highest success chance
 * (ties go to the earlier action in ACTION_IDS) with no modifier. The roll comes from
 * the court's seeded RNG, so the same seed and inputs give the same result.
 */
export function resolveMoment(
  moment: KeyMoment,
  court: MomentCourt,
  rng: SeededRng,
  choose?: (moment: KeyMoment) => MomentChoice,
): KeyMomentResult {
  const choice: MomentChoice =
    moment.userControlled && choose
      ? choose(moment)
      : { actionId: bestAction(decisionCards(moment.attributes)) };
  const run = runKeyMomentCourt({
    ...court,
    actionId: choice.actionId,
    modifier: choice.modifier,
    seed: rng.int(0, 0x7fffffff),
  });
  return {
    moment,
    actionId: choice.actionId,
    success: run.outcome.success,
    reward: run.outcome.reward,
  };
}

/** Highest success chance first; ties keep the order of ACTION_IDS. */
export function bestAction(cards: Record<ActionId, number>): ActionId {
  let best: ActionId = ACTION_IDS[0] as ActionId;
  for (const id of ACTION_IDS) {
    if (cards[id] > cards[best]) best = id;
  }
  return best;
}
