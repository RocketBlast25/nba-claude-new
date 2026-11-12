import type { Player } from '../core/models';
import type { SeededRng } from '../core/random';
import { CAREER_CONFIG } from './careerConfig';

export type RetirementReason = 'forced_age' | 'low_overall' | 'unsigned_veteran';

/**
 * Decides whether a player retires this offseason. Rules, in order:
 *  - age at or above forcedAge always retires;
 *  - age at or above lowOverallAge with overall below the floor retires with a seeded chance;
 *  - a veteran (age >= unsignedVeteranAge) unsigned for enough consecutive offseasons retires.
 * Returns the reason, or null if the player continues.
 */
export function retirementReason(
  player: Player,
  unsignedOffseasons: number,
  rng: SeededRng,
): RetirementReason | null {
  const r = CAREER_CONFIG.retirement;
  if (player.age >= r.forcedAge) return 'forced_age';
  if (player.age >= r.lowOverallAge && player.overall < r.lowOverallFloor && rng.chance(r.lowOverallChance)) {
    return 'low_overall';
  }
  if (player.age >= r.unsignedVeteranAge && unsignedOffseasons >= r.unsignedOffseasonsToRetire) {
    return 'unsigned_veteran';
  }
  return null;
}
