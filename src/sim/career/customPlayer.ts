import { clampAttribute, type Attributes, type Player, type Position } from '../core/models';
import type { PlayerId } from '../core/types';
import { overallOf } from '../league/roster';
import { LEAGUE_CONFIG } from '../league/leagueConfig';

/** Playing styles offered when creating a custom MyCareer player. */
export type ArchetypeId = 'all_around' | 'sharpshooter' | 'slasher' | 'floor_general' | 'lockdown' | 'post_scorer';

export interface Archetype {
  id: ArchetypeId;
  name: string;
  /** One-line summary shown next to the choice. */
  description: string;
  /** Attribute offsets from the shared base. Every attribute starts at BASE_ATTRIBUTE. */
  offsets: Partial<Attributes>;
}

export const BASE_ATTRIBUTE = 62;

/** Positions in display order. */
export const POSITION_OPTIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

export const ARCHETYPES: Archetype[] = [
  {
    id: 'all_around',
    name: 'All-Around',
    description: 'No weak spot; a little of everything.',
    offsets: { finishing: 6, closeShot: 6, midRange: 6, threePoint: 6, freeThrow: 6, ballHandling: 6, passing: 6, basketballIQ: 6, perimeterDefense: 6, interiorDefense: 6, rebounding: 6, speed: 6, strength: 6 },
  },
  {
    id: 'sharpshooter',
    name: 'Sharpshooter',
    description: 'Elite from three, limited inside.',
    offsets: { threePoint: 18, midRange: 12, freeThrow: 10, closeShot: -6, interiorDefense: -8, rebounding: -8, strength: -6 },
  },
  {
    id: 'slasher',
    name: 'Slasher',
    description: 'Finishes at the rim and runs the floor.',
    offsets: { finishing: 16, closeShot: 10, speed: 10, freeThrow: -4, threePoint: -10, interiorDefense: -6 },
  },
  {
    id: 'floor_general',
    name: 'Floor General',
    description: 'Runs the offense and sees the floor.',
    offsets: { passing: 18, ballHandling: 14, basketballIQ: 12, threePoint: 4, interiorDefense: -6, strength: -6 },
  },
  {
    id: 'lockdown',
    name: 'Lockdown Defender',
    description: 'Guards the other team’s best player.',
    offsets: { perimeterDefense: 18, interiorDefense: 10, basketballIQ: 8, speed: 6, threePoint: -8, finishing: -6 },
  },
  {
    id: 'post_scorer',
    name: 'Post Scorer',
    description: 'Scores and rebounds on the block.',
    offsets: { interiorDefense: 10, rebounding: 14, strength: 14, closeShot: 10, finishing: 8, threePoint: -12, speed: -8 },
  },
];

const ATTRIBUTE_KEYS: (keyof Attributes)[] = [
  'finishing', 'closeShot', 'midRange', 'threePoint', 'freeThrow',
  'ballHandling', 'passing', 'basketballIQ', 'perimeterDefense',
  'interiorDefense', 'rebounding', 'speed', 'strength', 'stamina',
];

/** Typical height in inches per position, used when the player gives no height. */
const HEIGHT_BY_POSITION: Record<Position, number> = { PG: 74, SG: 77, SF: 79, PF: 81, C: 84 };

export interface CreateCustomPlayerInput {
  id: PlayerId;
  name: string;
  position: Position;
  archetype: ArchetypeId;
}

/** Looks up an archetype, falling back to all-around for an unknown id. */
export function archetypeOf(id: ArchetypeId): Archetype {
  return ARCHETYPES.find((a) => a.id === id) ?? ARCHETYPES[0]!;
}

/**
 * Builds a rookie-level Player from a name, position and archetype. Pure and
 * deterministic: the same input always yields the same attributes and overall.
 */
export function createCustomPlayer(input: CreateCustomPlayerInput): Player {
  const archetype = archetypeOf(input.archetype);
  const attributes = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    attributes[key] = clampAttribute(BASE_ATTRIBUTE + (archetype.offsets[key] ?? 0));
  }
  const overall = overallOf(attributes);
  return {
    id: input.id,
    name: input.name.trim(),
    age: 19,
    position: input.position,
    heightIn: HEIGHT_BY_POSITION[input.position],
    attributes,
    badges: [],
    overall,
    potential: clampAttribute(overall + 8),
    stamina: 100,
    contract: { salary: LEAGUE_CONFIG.salary.rookieFloor, yearsLeft: 1, type: 'rookie' },
  };
}
