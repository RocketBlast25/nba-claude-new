import { clampAttribute, type Attributes, type Player, type Position } from '../core/models';
import type { SeededRng } from '../core/random';
import { makeId, type PlayerId, type TeamId } from '../core/types';

const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const ATTRIBUTE_KEYS: (keyof Attributes)[] = [
  'finishing', 'closeShot', 'midRange', 'threePoint', 'freeThrow',
  'ballHandling', 'passing', 'basketballIQ', 'perimeterDefense',
  'interiorDefense', 'rebounding', 'speed', 'strength', 'stamina',
];

/** Generates one player's attributes around a seeded base value. Pure for a given RNG state. */
export function generateAttributes(rng: SeededRng, base: number): Attributes {
  const attrs = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    attrs[key] = clampAttribute(base + rng.range(-12, 12));
  }
  return attrs;
}

/** Mean of the 14 attributes, rounded. Used as a simple overall rating. */
export function overallOf(attributes: Attributes): number {
  const sum = ATTRIBUTE_KEYS.reduce((s, k) => s + attributes[k], 0);
  return Math.round(sum / ATTRIBUTE_KEYS.length);
}

/** Generates a roster of players for one team with deterministic IDs. */
export function generateRoster(teamId: TeamId, size: number, rng: SeededRng): Player[] {
  const players: Player[] = [];
  for (let i = 0; i < size; i++) {
    const base = rng.int(45, 80);
    const attributes = generateAttributes(rng, base);
    const overall = overallOf(attributes);
    const id: PlayerId = makeId<'player'>(`${teamId}-p${i + 1}`);
    players.push({
      id,
      name: `Player ${teamId}-${i + 1}`,
      age: rng.int(19, 34),
      position: rng.pick(POSITIONS),
      heightIn: rng.int(72, 86),
      attributes,
      badges: [],
      overall,
      potential: clampAttribute(overall + rng.int(0, 10)),
      stamina: 100,
      contract: { salary: 1000, yearsLeft: 1, type: 'standard' },
    });
  }
  return players;
}
