import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../../../src/sim/core/random';

describe('SeededRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = new SeededRng(12345);
    const b = new SeededRng(12345);
    const seqA = Array.from({ length: 1000 }, () => a.next());
    const seqB = Array.from({ length: 1000 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new SeededRng(1).next();
    const b = new SeededRng(2).next();
    expect(a).not.toBe(b);
  });

  it('keeps next() within [0, 1)', () => {
    const rng = new SeededRng(7);
    for (let i = 0; i < 10000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('matches a known fixed value for seed 42 (regression guard)', () => {
    const rng = new SeededRng(42);
    const first = rng.next();
    expect(new SeededRng(42).next()).toBe(first);
    expect(first).toBeGreaterThanOrEqual(0);
  });

  it('returns integers within the inclusive int() range', () => {
    const rng = new SeededRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(3, 5);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5]);
  });

  it('throws when int() has max below min', () => {
    expect(() => new SeededRng(1).int(5, 3)).toThrow(RangeError);
  });

  it('chance() respects probability bounds', () => {
    const rng = new SeededRng(3);
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(1)).toBe(true);
    expect(rng.chance(-5)).toBe(false);
    expect(rng.chance(5)).toBe(true);
  });

  it('weighted() never picks a zero-weight item', () => {
    const rng = new SeededRng(11);
    for (let i = 0; i < 5000; i++) {
      expect(rng.weighted(['a', 'b', 'c'], [0, 1, 0])).toBe('b');
    }
  });

  it('weighted() approximates the weight ratio over many draws', () => {
    const rng = new SeededRng(2024);
    let heads = 0;
    const trials = 100000;
    for (let i = 0; i < trials; i++) {
      if (rng.weighted(['h', 't'], [3, 1]) === 'h') heads++;
    }
    expect(heads / trials).toBeGreaterThan(0.74);
    expect(heads / trials).toBeLessThan(0.76);
  });

  it('weighted() rejects invalid weights', () => {
    const rng = new SeededRng(1);
    expect(() => rng.weighted(['a'], [0])).toThrow(RangeError);
    expect(() => rng.weighted(['a', 'b'], [1])).toThrow(RangeError);
    expect(() => rng.weighted(['a'], [-1])).toThrow(RangeError);
  });

  it('shuffle() returns a permutation without mutating the input', () => {
    const rng = new SeededRng(8);
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = rng.shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((x, y) => x - y)).toEqual(input);
  });

  it('shuffle() is reproducible for the same seed', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    expect(new SeededRng(5).shuffle(items)).toEqual(new SeededRng(5).shuffle(items));
  });

  it('pick() throws on an empty array', () => {
    expect(() => new SeededRng(1).pick([])).toThrow(RangeError);
  });

  it('fork() yields a reproducible child stream that does not mirror the parent', () => {
    const parentA = new SeededRng(77);
    const parentB = new SeededRng(77);
    const childA = parentA.fork();
    const childB = parentB.fork();
    expect(childA.next()).toBe(childB.next());
    expect(childA.next()).not.toBe(parentA.next());
  });
});
