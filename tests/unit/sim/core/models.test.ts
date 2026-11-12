import { describe, expect, it } from 'vitest';
import { ATTRIBUTE_MAX, ATTRIBUTE_MIN, clampAttribute } from '../../../../src/sim/core/models';

describe('clampAttribute', () => {
  it('keeps in-range values unchanged', () => {
    expect(clampAttribute(60)).toBe(60);
  });

  it('clamps values below the minimum', () => {
    expect(clampAttribute(-10)).toBe(ATTRIBUTE_MIN);
  });

  it('clamps values above the maximum', () => {
    expect(clampAttribute(150)).toBe(ATTRIBUTE_MAX);
  });

  it('rounds fractional values to whole numbers', () => {
    expect(clampAttribute(70.4)).toBe(70);
    expect(clampAttribute(70.6)).toBe(71);
  });
});
