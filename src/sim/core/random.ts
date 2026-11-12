/**
 * Seeded pseudo-random number generator. All simulation randomness must go
 * through this class so that a given seed reproduces the same results.
 *
 * Algorithm: mulberry32, a small, fast 32-bit generator with a full 2^32 period.
 * It is not cryptographically secure, which is fine for game simulation.
 */
export class SeededRng {
  private state: number;

  /** @param seed Any integer. The same seed always yields the same sequence. */
  constructor(seed: number) {
    // Coerce to an unsigned 32-bit integer so negative and fractional seeds are stable.
    this.state = seed >>> 0;
  }

  /** Returns the raw internal state, so a stream can be saved and restored exactly. */
  getState(): number {
    return this.state;
  }

  /** Recreates a generator from a value returned by getState(). */
  static fromState(state: number): SeededRng {
    const rng = new SeededRng(0);
    rng.state = state >>> 0;
    return rng;
  }

  /** Returns the next float in the half-open interval [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns a float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Returns an integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    if (max < min) {
      throw new RangeError(`int(): max (${max}) must be >= min (${min})`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Returns true with the given probability, clamped to [0, 1]. */
  chance(probability: number): boolean {
    return this.next() < Math.min(1, Math.max(0, probability));
  }

  /** Picks one element uniformly. Throws on an empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RangeError('pick(): cannot pick from an empty array');
    }
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /**
   * Picks one element with probability proportional to its weight.
   * Weights must be non-negative and sum to more than zero.
   */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    if (items.length === 0 || items.length !== weights.length) {
      throw new RangeError('weighted(): items and weights must be non-empty and equal length');
    }
    let total = 0;
    for (const w of weights) {
      if (w < 0 || !Number.isFinite(w)) {
        throw new RangeError('weighted(): weights must be finite and non-negative');
      }
      total += w;
    }
    if (total <= 0) {
      throw new RangeError('weighted(): weights must sum to more than zero');
    }
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i] as number;
      if (roll < 0) return items[i] as T;
    }
    // Floating-point guard: fall through to the last item with positive weight.
    for (let i = items.length - 1; i >= 0; i--) {
      if ((weights[i] as number) > 0) return items[i] as T;
    }
    return items[items.length - 1] as T;
  }

  /** Returns a new array with the elements shuffled (Fisher-Yates). The input is not mutated. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }

  /** Returns an independent child generator derived from this one. */
  fork(): SeededRng {
    return new SeededRng(Math.floor(this.next() * 0xffffffff));
  }
}
