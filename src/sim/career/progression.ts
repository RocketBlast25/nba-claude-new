import { clampAttribute, type Attributes, type Player } from '../core/models';
import type { SeededRng } from '../core/random';
import { overallOf } from '../league/roster';
import { CAREER_CONFIG } from './careerConfig';

const { progression } = CAREER_CONFIG;

/** Base yearly change for an age: growth while young, flat at peak, decline after. */
export function baseChangeForAge(age: number): number {
  if (age <= progression.developmentMaxAge) return progression.developmentBase;
  if (age <= progression.peakMaxAge) return progression.peakBase;
  return progression.declineBase;
}

/** Pull toward potential: a player far below potential improves faster, capped. */
export function potentialPullFor(overall: number, potential: number): number {
  const gap = Math.max(0, potential - overall);
  return Math.min(progression.potentialPullCap, gap * progression.potentialPull);
}

/**
 * Advances one player by one season: ages them, changes each attribute by the
 * age base, potential pull, mood bonus and seeded noise, then recomputes overall.
 * Returns a new Player; the input is not mutated.
 */
export function progressPlayer(player: Player, mood: number, rng: SeededRng): Player {
  const base = baseChangeForAge(player.age);
  const pull = potentialPullFor(player.overall, player.potential);
  const moodBonus = mood > CAREER_CONFIG.offCourt.moodGrowthThreshold ? CAREER_CONFIG.offCourt.growthBonus : 0;
  const attributes = {} as Attributes;
  for (const key of Object.keys(player.attributes) as (keyof Attributes)[]) {
    const noise = rng.range(-progression.noise, progression.noise);
    attributes[key] = clampAttribute(player.attributes[key] + base + pull + moodBonus + noise);
  }
  const overall = overallOf(attributes);
  return {
    ...player,
    age: player.age + 1,
    attributes,
    overall,
    potential: Math.max(player.potential, overall),
  };
}
