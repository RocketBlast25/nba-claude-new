import type { GameId, PlayerId, TeamId } from './types';

/** Attribute values run from 25 to 99. */
export const ATTRIBUTE_MIN = 25;
export const ATTRIBUTE_MAX = 99;

/** The 14 core attributes, grouped by category in the UI. */
export interface Attributes {
  // Finishing
  finishing: number;
  closeShot: number;
  // Shooting
  midRange: number;
  threePoint: number;
  freeThrow: number;
  // Playmaking
  ballHandling: number;
  passing: number;
  basketballIQ: number;
  // Defense and rebounding
  perimeterDefense: number;
  interiorDefense: number;
  rebounding: number;
  // Physicals
  speed: number;
  strength: number;
  stamina: number;
}

export type AttributeKey = keyof Attributes;

/** Unlockable traits, e.g. 'clutch_gene', 'floor_general', 'lockdown_defender'. */
export type BadgeId = string;

export type BadgeTier = 'bronze' | 'silver' | 'gold';

/** A static badge definition. Players hold BadgeIds that reference these. */
export interface Badge {
  id: BadgeId;
  name: string;
  tier: BadgeTier;
  description: string;
}

export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export type ContractType = 'rookie' | 'standard' | 'max' | 'minimum' | 'mle' | 'bird_extension';

/** Salary values are in thousands of dollars. */
export interface Contract {
  salary: number;
  yearsLeft: number;
  type: ContractType;
  teamOptionYears?: number;
}

/** Counting stats for one player in one game. Minutes are whole minutes. */
export interface GameBoxScore {
  gameId: GameId;
  playerId: PlayerId;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  fgm: number;
  fga: number;
  threePm: number;
  threePa: number;
  ftm: number;
  fta: number;
}

export interface Player {
  id: PlayerId;
  name: string;
  age: number;
  position: Position;
  secondaryPosition?: Position;
  heightIn: number;
  attributes: Attributes;
  badges: BadgeId[];
  /** Derived from attributes and position weights. */
  overall: number;
  potential: number;
  /** 0 to 100. */
  stamina: number;
  injury?: { type: 'minor' | 'major'; gamesOut: number };
  contract: Contract;
}

export interface Team {
  id: TeamId;
  city: string;
  name: string;
  conference: 'East' | 'West';
  division: string;
  rosterIds: PlayerId[];
  starterIds: PlayerId[];
  /** 0 to 100. */
  chemistry: number;
  /** Governs minutes and usage. 0 to 100. */
  coachTrust: number;
  /** Per-city popularity. 0 to 100. */
  fanPopularity: number;
  marketSize: number;
  /** Thousands of dollars. */
  payroll: number;
  capSpace: number;
  luxuryTaxPaid: number;
}

/** Clamps an attribute value into the valid 25–99 range. */
export function clampAttribute(value: number): number {
  return Math.min(ATTRIBUTE_MAX, Math.max(ATTRIBUTE_MIN, Math.round(value)));
}
