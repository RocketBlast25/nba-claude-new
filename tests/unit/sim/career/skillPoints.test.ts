import { describe, expect, it } from 'vitest';
import type { AttributeKey, Attributes } from '../../../../src/sim/core/models';
import {
  SKILL_CATEGORIES,
  applyTrainingFocus,
  attributeCap,
  awardSkillPoints,
  categoryOf,
  objectiveSkillPoints,
  playoffSkillPoints,
  spendOnAttribute,
  upgradeCost,
} from '../../../../src/sim/career/skillPoints';

/** Every core attribute set to one value. */
function flat(value: number): Attributes {
  const attrs = {} as Record<AttributeKey, number>;
  for (const category of Object.values(SKILL_CATEGORIES)) {
    for (const key of category) attrs[key] = value;
  }
  return attrs as unknown as Attributes;
}

describe('skill point awards', () => {
  it('awards one SP per met objective', () => {
    expect(objectiveSkillPoints(0)).toBe(0);
    expect(objectiveSkillPoints(3)).toBe(3);
  });

  it('awards MVP 4, DPOY 3, All-NBA 2 and sums them', () => {
    expect(awardSkillPoints({ mvp: true, dpoy: false, allNba: false })).toBe(4);
    expect(awardSkillPoints({ mvp: false, dpoy: true, allNba: false })).toBe(3);
    expect(awardSkillPoints({ mvp: false, dpoy: false, allNba: true })).toBe(2);
    expect(awardSkillPoints({ mvp: true, dpoy: true, allNba: true })).toBe(9);
    expect(awardSkillPoints({ mvp: false, dpoy: false, allNba: false })).toBe(0);
  });

  it('awards one SP per round won plus a title bonus', () => {
    expect(playoffSkillPoints(0, false)).toBe(0);
    expect(playoffSkillPoints(2, false)).toBe(2);
    expect(playoffSkillPoints(4, true)).toBe(6);
  });
});

describe('upgrade cost and cap', () => {
  it('costs 1 SP below the threshold and rises above it', () => {
    expect(upgradeCost(50)).toBe(1);
    expect(upgradeCost(70)).toBe(1);
    expect(upgradeCost(80)).toBe(6);
  });

  it('caps at overall + 20, the ceiling 90, and the global maximum', () => {
    expect(attributeCap(60)).toBe(80);
    expect(attributeCap(85)).toBe(90);
  });
});

describe('spendOnAttribute', () => {
  it('raises the attribute by one and deducts the cost', () => {
    const result = spendOnAttribute(flat(60), 5, 60, 'threePoint');
    expect(result.ok).toBe(true);
    expect(result.attributes.threePoint).toBe(61);
    expect(result.skillPoints).toBe(4);
  });

  it('refuses when the balance is short and changes nothing', () => {
    // 60 is under the cap of 80, and the cost of 1 is above the 2-SP-short balance of 0.
    const attrs = flat(60);
    const result = spendOnAttribute(attrs, 0, 60, 'threePoint');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Not enough skill points');
    expect(result.attributes).toBe(attrs);
    expect(result.skillPoints).toBe(0);
  });

  it('refuses at the archetype cap', () => {
    const attrs = { ...flat(60), threePoint: 80 };
    const result = spendOnAttribute(attrs, 99, 60, 'threePoint');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('cap');
    expect(result.skillPoints).toBe(99);
  });
});

describe('applyTrainingFocus', () => {
  it('boosts every attribute in the focused category', () => {
    const next = applyTrainingFocus(flat(60), 60, 'shooting');
    for (const attr of SKILL_CATEGORIES.shooting) expect(next[attr]).toBe(62);
    expect(next.finishing).toBe(60);
  });

  it('clamps the boost to the cap', () => {
    const attrs = { ...flat(60), midRange: 79 };
    expect(applyTrainingFocus(attrs, 60, 'shooting').midRange).toBe(80);
  });

  it('returns the same attributes when no focus is set', () => {
    const attrs = flat(60);
    expect(applyTrainingFocus(attrs, 60, null)).toBe(attrs);
  });
});

describe('categoryOf', () => {
  it('maps every core attribute to exactly one category', () => {
    const all = Object.values(SKILL_CATEGORIES).flat();
    expect(new Set(all).size).toBe(all.length);
    for (const attr of all) expect(categoryOf(attr)).toBeDefined();
  });
});
