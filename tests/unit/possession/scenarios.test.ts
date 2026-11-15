import { describe, expect, it } from 'vitest';
import { SCENARIOS, selectScenario } from '../../../src/possession/scenarios';
import { SeededRng } from '../../../src/sim/core/random';

describe('situational scenarios', () => {
  it('defines 10 distinct scenarios, each with 3-4 plays mapped to an ActionId', () => {
    expect(SCENARIOS).toHaveLength(10);
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(10);
    for (const s of SCENARIOS) {
      expect(s.plays.length).toBeGreaterThanOrEqual(3);
      expect(s.plays.length).toBeLessThanOrEqual(4);
      for (const p of s.plays) {
        expect(['drive', 'pull_up', 'pass', 'reset']).toContain(p.actionId);
        expect(p.modifier.multiplier).toBeGreaterThan(0);
      }
    }
  });

  it('selects deterministically from the seed and context', () => {
    const ctx = { margin: 2, quarter: 2, overtimes: 0 };
    const a = selectScenario(ctx, new SeededRng(42));
    const b = selectScenario(ctx, new SeededRng(42));
    expect(a.id).toBe(b.id);
  });

  it('uses the overtime clutch scenario in overtime', () => {
    const s = selectScenario({ margin: 1, quarter: 4, overtimes: 1 }, new SeededRng(7));
    expect(s.id).toBe('overtime_clutch');
  });

  it('uses a late-game scenario when the game is late and close', () => {
    const s = selectScenario({ margin: 2, quarter: 4, overtimes: 0 }, new SeededRng(7));
    expect(['buzzer_beater', 'down_three_late']).toContain(s.id);
  });

  it('can reach every non-late scenario across seeds', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) {
      seen.add(selectScenario({ margin: 20, quarter: 2, overtimes: 0 }, new SeededRng(seed)).id);
    }
    expect(seen.size).toBe(7);
  });
});
