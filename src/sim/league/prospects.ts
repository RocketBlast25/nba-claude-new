import type { SeededRng } from '../core/random';
import { makeId, type PlayerId, type TeamId } from '../core/types';
import type { Player } from '../core/models';
import { generateAttributes, overallOf } from './roster';
import { LEAGUE_CONFIG } from './leagueConfig';

/** Picks a rating tier by share, then a rating within the tier's band. */
function tierOverall(rng: SeededRng): number {
  const tiers = LEAGUE_CONFIG.prospectTiers;
  const tier = rng.weighted(tiers, tiers.map((t) => t.share));
  return rng.int(tier.overall[0], tier.overall[1]);
}

/**
 * Generates one draft class of rookies (`count` prospects) with seeded tiered
 * ratings. Attributes are generated around the drawn tier value, so the final
 * overall lands near its band rather than exactly in it. IDs are deterministic.
 */
export function generateProspectClass(classLabel: string, count: number, rng: SeededRng): Player[] {
  const prospects: Player[] = [];
  for (let i = 0; i < count; i++) {
    const target = tierOverall(rng);
    const attributes = generateAttributes(rng, target);
    const overall = overallOf(attributes);
    const id: PlayerId = makeId<'player'>(`${classLabel}-r${i + 1}`);
    prospects.push({
      id,
      name: `Prospect ${classLabel}-${i + 1}`,
      age: rng.int(19, 22),
      position: rng.pick(['PG', 'SG', 'SF', 'PF', 'C'] as const),
      heightIn: rng.int(72, 84),
      attributes,
      badges: [],
      overall,
      potential: Math.min(99, overall + rng.int(3, 15)),
      stamina: 100,
      contract: { salary: LEAGUE_CONFIG.salary.rookieFloor, yearsLeft: 0, type: 'rookie' },
    });
  }
  return prospects;
}

/** Team id used when a rookie has been drafted but not yet assigned. */
export type DraftedProspect = { player: Player; teamId: TeamId; pick: number };
