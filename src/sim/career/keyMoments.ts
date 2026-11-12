import type { Player } from '../core/models';
import type { SeededRng } from '../core/random';
import { createPossession, step } from '../../possession/engine';
import type { CourtEntity } from '../../possession/types';
import { snapshotCourt } from '../../possession/replay';
import { ACTION_IDS, decide, decisionCards, type ActionId } from '../../possession/decision';
import { CAREER_CONFIG } from './careerConfig';
import type { CourtSnapshot } from '../../possession/replay';
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
    if (userControlled) moment.replay = buildReplay(actor, actors, rng);
    moments.push(moment);
  }
  return moments;
}

const REPLAY_FRAMES = 8;
const REPLAY_FRAME_MS = 500;

/**
 * Sets the court for a user-controlled moment from the real roster: the acting
 * player holds the ball, four teammates spread on offense, five defenders set
 * across from them. Positions come from the seeded RNG, so the setup is
 * deterministic. The possession engine then steps this state through the
 * execution span, and each frame is captured with snapshotCourt.
 */
export function buildCourt(actor: Player, actors: Player[], rng: SeededRng): CourtEntity[] {
  const offense = actors.filter((a) => a.id !== actor.id).slice(0, 4);
  const entities: CourtEntity[] = [];
  const carrier = { x: rng.range(300, 640), y: rng.range(150, 350), vx: rng.range(-40, 40), vy: rng.range(-30, 30) };
  entities.push({ id: actor.id, teamId: null, ...carrier });
  entities.push({ id: 'ball', teamId: null, x: carrier.x, y: carrier.y, vx: carrier.vx, vy: carrier.vy });
  for (const mate of offense) {
    entities.push({
      id: mate.id,
      teamId: null,
      x: rng.range(80, 860),
      y: rng.range(60, 440),
      vx: rng.range(-50, 50),
      vy: rng.range(-35, 35),
    });
  }
  for (let d = 0; d < 5; d++) {
    entities.push({
      id: `def-${d}` as CourtEntity['id'],
      teamId: null,
      x: rng.range(80, 860),
      y: rng.range(60, 440),
      vx: rng.range(-50, 50),
      vy: rng.range(-35, 35),
    });
  }
  return entities;
}

/**
 * Steps the possession engine across the execution span and captures a frame
 * each REPLAY_FRAME_MS. Positions are clamped to the court by snapshotCourt.
 */
function buildReplay(actor: Player, actors: Player[], rng: SeededRng): CourtSnapshot[] {
  const entities = buildCourt(actor, actors, rng);
  let state = createPossession(entities);
  const frames: CourtSnapshot[] = [snapshotCourt(state)];
  for (let f = 1; f < REPLAY_FRAMES; f++) {
    state = step(state, REPLAY_FRAME_MS);
    frames.push(snapshotCourt(state));
  }
  return frames;
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
