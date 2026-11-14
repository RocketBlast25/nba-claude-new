import { ATTRIBUTE_MAX, type AttributeKey, type Attributes } from '../core/models';

/**
 * Skill Points (SP) and attribute progression. Pure and deterministic: no randomness,
 * no DOM. SP is earned from play and spent on the 14 core attributes, grouped into the
 * six categories the UI shows.
 */

export const SKILL_POINT_CONFIG = {
  /** SP per completed Coach Objective. */
  perObjectiveMet: 1,
  /** SP for winning MVP, Defensive Player of the Year, or earning an All-NBA spot. */
  perAward: { mvp: 4, dpoy: 3, all_league: 2 },
  /** SP for each playoff round the player's team wins, and a bonus for the title. */
  perPlayoffRound: 1,
  championshipBonus: 2,
  /** Base cost of a single point, plus a surcharge per point above the cost threshold. */
  baseCost: 1,
  costThreshold: 70,
  costPerPointAbove: 0.5,
  /** Hard ceiling on any one attribute reached by spending SP, below the global maximum. */
  attributeCeiling: 90,
  /** Points added by each training focus during the offseason. */
  trainingBoost: 2,
} as const;

export type SkillCategory =
  | 'finishing'
  | 'shooting'
  | 'playmaking'
  | 'perimeter_defense'
  | 'interior_defense'
  | 'athleticism';

/** Attributes each category upgrades. Covers all 14 core attributes between them. */
export const SKILL_CATEGORIES: Record<SkillCategory, readonly AttributeKey[]> = {
  finishing: ['finishing', 'closeShot'],
  shooting: ['midRange', 'threePoint', 'freeThrow'],
  playmaking: ['ballHandling', 'passing', 'basketballIQ'],
  perimeter_defense: ['perimeterDefense'],
  interior_defense: ['interiorDefense', 'rebounding'],
  athleticism: ['speed', 'strength', 'stamina'],
};

/** Ordered category list for display. */
export const SKILL_CATEGORY_ORDER: readonly SkillCategory[] = [
  'finishing',
  'shooting',
  'playmaking',
  'perimeter_defense',
  'interior_defense',
  'athleticism',
];

/** The category an attribute belongs to. */
export function categoryOf(attr: AttributeKey): SkillCategory {
  for (const category of SKILL_CATEGORY_ORDER) {
    if (SKILL_CATEGORIES[category].includes(attr)) return category;
  }
  throw new Error(`categoryOf: unknown attribute ${attr}`);
}

/** Cost of raising an attribute from its current value by one point. Rises above the threshold. */
export function upgradeCost(current: number): number {
  const c = SKILL_POINT_CONFIG;
  return c.baseCost + Math.max(0, current - c.costThreshold) * c.costPerPointAbove;
}

/**
 * Highest value an attribute may reach. The archetype cap is the player's overall plus
 * a fixed headroom, so a role player cannot be spent into a superstar's ceiling.
 */
export function attributeCap(overall: number): number {
  return Math.min(SKILL_POINT_CONFIG.attributeCeiling, ATTRIBUTE_MAX, overall + 20);
}

export interface UpgradeResult {
  ok: boolean;
  reason?: string;
  attributes: Attributes;
  skillPoints: number;
}

/**
 * Spends SP to raise one attribute by one point. Fails without changing anything when the
 * balance is short or the attribute is at its archetype cap.
 */
export function spendOnAttribute(
  attributes: Attributes,
  skillPoints: number,
  overall: number,
  attr: AttributeKey,
): UpgradeResult {
  const current = attributes[attr];
  const cap = attributeCap(overall);
  if (current >= cap) {
    return { ok: false, reason: `${attr} is at its cap of ${cap}`, attributes, skillPoints };
  }
  const cost = upgradeCost(current);
  if (skillPoints < cost) {
    return { ok: false, reason: 'Not enough skill points', attributes, skillPoints };
  }
  return {
    ok: true,
    attributes: { ...attributes, [attr]: current + 1 },
    skillPoints: skillPoints - cost,
  };
}

/** The offseason training focus. Null means no focus is set. */
export type TrainingFocus = SkillCategory | null;

/**
 * Applies the chosen training focus: each attribute in the category gains the training
 * boost, clamped to the archetype cap. A null focus returns the attributes unchanged.
 */
export function applyTrainingFocus(
  attributes: Attributes,
  overall: number,
  focus: TrainingFocus,
): Attributes {
  if (focus === null) return attributes;
  const cap = attributeCap(overall);
  const next = { ...attributes };
  for (const attr of SKILL_CATEGORIES[focus]) {
    next[attr] = Math.min(cap, attributes[attr] + SKILL_POINT_CONFIG.trainingBoost);
  }
  return next;
}

/** SP earned from one season's Coach Objectives. */
export function objectiveSkillPoints(objectivesMet: number): number {
  return objectivesMet * SKILL_POINT_CONFIG.perObjectiveMet;
}

/** SP earned from the season awards the controlled player won. */
export function awardSkillPoints(awards: { mvp: boolean; dpoy: boolean; allNba: boolean }): number {
  const a = SKILL_POINT_CONFIG.perAward;
  let total = 0;
  if (awards.mvp) total += a.mvp;
  if (awards.dpoy) total += a.dpoy;
  if (awards.allNba) total += a.all_league;
  return total;
}

/** SP earned from a playoff run: a point per round won, plus a bonus for the title. */
export function playoffSkillPoints(roundsWon: number, champion: boolean): number {
  const c = SKILL_POINT_CONFIG;
  return roundsWon * c.perPlayoffRound + (champion ? c.championshipBonus : 0);
}
