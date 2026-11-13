import { describe, expect, it } from 'vitest';
import { GOAT_LEGENDS, type GoatLegend } from '../../../../src/sim/career/goatCatalog';
import { computeGoatScore, type GoatProfile } from '../../../../src/sim/career/goatRanking';
import { buildTaleOfTheTape, nextMilestone, profileOfLegend } from '../../../../src/sim/career/goatCompare';

const empty: GoatProfile = {
  name: 'You',
  rings: 0,
  finalsMvps: 0,
  mvps: 0,
  allNbaSelections: 0,
  careerPoints: 0,
  careerRebounds: 0,
  careerAssists: 0,
  playoffPoints: 0,
  ppg: 0,
  rpg: 0,
  apg: 0,
};

const legend = (id: string): GoatLegend => {
  const found = GOAT_LEGENDS.find((l) => l.id === id);
  if (!found) throw new Error(`missing legend ${id}`);
  return found;
};

describe('buildTaleOfTheTape', () => {
  it('lines the two profiles up across all ten categories', () => {
    const tape = buildTaleOfTheTape({ ...empty, rings: 2, mvps: 1 }, legend('michael-jordan'));
    expect(tape.rows.map((r) => r.key)).toEqual([
      'rings',
      'mvps',
      'finalsMvps',
      'allNba',
      'careerPoints',
      'careerRebounds',
      'careerAssists',
      'ppg',
      'rpg',
      'apg',
    ]);
    const rings = tape.rows.find((r) => r.key === 'rings');
    expect(rings).toMatchObject({ user: 2, legend: 6, leader: 'legend' });
  });

  it('marks the user as leader where they are ahead and even on ties', () => {
    const jordan = legend('michael-jordan');
    const tape = buildTaleOfTheTape({ ...empty, rings: 9 }, jordan);
    expect(tape.rows.find((r) => r.key === 'rings')?.leader).toBe('user');
    expect(tape.rows.find((r) => r.key === 'mvps')?.leader).toBe(
      jordan.mvps === 0 ? 'even' : 'legend',
    );
  });

  it('reports both scores from the shared score function', () => {
    const jordan = legend('michael-jordan');
    const user = { ...empty, rings: 3 };
    const tape = buildTaleOfTheTape(user, jordan);
    expect(tape.userScore).toBe(computeGoatScore(user));
    expect(tape.legendScore).toBe(computeGoatScore(profileOfLegend(jordan)));
  });
});

describe('nextMilestone', () => {
  it('targets the lowest-scoring legend that is still above the player', () => {
    const user = { ...empty, rings: 1, careerPoints: 2000 };
    const next = nextMilestone(user);
    const userScore = computeGoatScore(user);
    expect(next.target).not.toBeNull();
    expect(next.target!.goatScore).toBeGreaterThan(userScore);
    for (const l of GOAT_LEGENDS) {
      const score = computeGoatScore(profileOfLegend(l));
      if (score > userScore) expect(score).toBeGreaterThanOrEqual(next.target!.goatScore);
    }
  });

  it('gives an exact per-category gap that closes the score difference alone', () => {
    const user = { ...empty, rings: 1 };
    const next = nextMilestone(user);
    expect(next.target).not.toBeNull();
    const ringsGap = next.gaps.find((g) => g.key === 'rings');
    expect(ringsGap?.needed).toBe(Math.ceil(next.scoreGap / 1000));
  });

  it('returns no target when the player already outscores every legend', () => {
    const next = nextMilestone({ ...empty, rings: 99, mvps: 99, finalsMvps: 99 }, GOAT_LEGENDS);
    expect(next.target).toBeNull();
    expect(next.gaps).toEqual([]);
  });
});
