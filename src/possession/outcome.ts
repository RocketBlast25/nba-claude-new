/**
 * Resolves a Key Moment from the play itself instead of one attribute roll.
 * The shot contest (from defender distance, closing speed and angle at release),
 * pass-lane pressure, a rim bounce and a rebound decide the result. The chance comes
 * from the actor's ratings and the defence in front of them; the seeded RNG makes the
 * final success roll, so the same seed always gives the same play. Pure: no DOM, no React.
 */
import type { Attributes } from '../sim/core/models';
import type { SeededRng } from '../sim/core/random';
import type { Vec } from './defense';
import { shotContest } from './defense';
import { laneInterceptRisk, type PassStyle } from './ballphysics';
import { resolveRebound, type ReboundCandidate } from './rebound';
import { ACTION_RULES, successChance, type ActionId, type DecisionOutcome } from './decision';

/** The defender and the pass context at release, in court units. */
export interface ReleaseContext {
  actionId: ActionId;
  shooter: Vec;
  shooterVel: Vec;
  /** The hoop being attacked. */
  hoop: Vec;
  /** Defenders with their position at release, for shot contest and lane pressure. */
  defenders: Array<{ pos: Vec; vel: Vec }>;
  /** The pass receiver and the chosen style, for pass actions. */
  pass?: { receiver: Vec; style: PassStyle };
  /** Players who can scramble for a miss, with their side and rebounding rating. */
  reboundCandidates: ReboundCandidate[];
  /** Situational scenario modifier; omitted means no change. */
  modifier?: { multiplier: number; bonus: number };
}

/**
 * Shot quality on a 0–1 scale: the rating-based chance is reduced by the contest.
 * A fully contested shot loses up to 45% of its chance; an uncontested one keeps it.
 */
export function playShotChance(baseChance: number, contest: number): number {
  return Math.max(0, Math.min(1, baseChance * (1 - 0.45 * contest)));
}

/**
 * Resolves a Key Moment. For shots the contest lowers the chance; for passes the lane
 * risk can cut the play before it reaches the receiver. A missed shot is followed by a
 * rebound, which affects the reward but not the success flag.
 */
export function resolvePlay(
  attributes: Attributes,
  ctx: ReleaseContext,
  rng: SeededRng,
): { outcome: DecisionOutcome; reboundWinnerId: string | null } {
  const rule = ACTION_RULES[ctx.actionId];
  const base = successChance(rule, attributes);

  let chance: number;
  if (ctx.actionId === 'pass' && ctx.pass) {
    const risk = laneInterceptRisk(
      ctx.shooter,
      ctx.pass.receiver,
      ctx.defenders.map((d) => d.pos),
      ctx.pass.style,
    );
    chance = base * (1 - risk);
  } else if (ctx.actionId === 'drive' || ctx.actionId === 'pull_up') {
    const contest = shotContest(ctx.shooter, ctx.shooterVel, ctx.hoop, ctx.defenders);
    chance = playShotChance(base, contest);
  } else {
    chance = base;
  }

  if (ctx.modifier) {
    chance = Math.max(0, Math.min(1, chance * ctx.modifier.multiplier + ctx.modifier.bonus));
  }

  const success = rng.chance(chance);
  let reboundWinnerId: string | null = null;
  if (!success && (ctx.actionId === 'drive' || ctx.actionId === 'pull_up') && ctx.reboundCandidates.length > 0) {
    const landing = ctx.hoop;
    reboundWinnerId = resolveRebound(ctx.reboundCandidates, landing)?.winnerId ?? null;
  }

  return {
    outcome: {
      actionId: ctx.actionId,
      successChance: chance,
      success,
      reward: success ? rule.reward : 0,
    },
    reboundWinnerId,
  };
}
