/**
 * Head-to-head comparison between the controlled player and a legend (GOAT board).
 *
 * `buildTaleOfTheTape` lines the two profiles up stat by stat. `nextMilestone` finds the
 * closest legend ranked above the player and reports the exact gap in each category
 * that would close it. Both use the same score and profile types as the board.
 *
 * Pure: reads profiles, returns plain data. No store, no React, no DOM.
 */
import { GOAT_LEGENDS, type GoatLegend } from './goatCatalog';
import { computeGoatScore, GOAT_WEIGHTS, type GoatProfile } from './goatRanking';

export interface TapeRow {
  key: 'rings' | 'mvps' | 'finalsMvps' | 'allNba' | 'careerPoints' | 'careerRebounds' | 'careerAssists' | 'ppg' | 'rpg' | 'apg';
  label: string;
  user: number;
  legend: number;
  /** Which side is ahead on this stat, or 'even'. */
  leader: 'user' | 'legend' | 'even';
}

export interface TaleOfTheTape {
  legendId: string;
  legendName: string;
  rows: TapeRow[];
  userScore: number;
  legendScore: number;
}

/** Converts a catalog legend into the profile shape the score reads. */
export function profileOfLegend(legend: GoatLegend): GoatProfile {
  return {
    name: legend.name,
    rings: legend.rings,
    finalsMvps: legend.finalsMvps,
    mvps: legend.mvps,
    allNbaSelections: legend.allNbaSelections,
    careerPoints: legend.careerPoints,
    careerRebounds: legend.careerRebounds,
    careerAssists: legend.careerAssists,
    playoffPoints: 0,
    ppg: legend.ppg,
    rpg: legend.rpg,
    apg: legend.apg,
  };
}

const TAPE_KEYS: Array<[TapeRow['key'], string]> = [
  ['rings', 'Rings'],
  ['mvps', 'MVPs'],
  ['finalsMvps', 'Finals MVPs'],
  ['allNba', 'All-NBA'],
  ['careerPoints', 'Career points'],
  ['careerRebounds', 'Career rebounds'],
  ['careerAssists', 'Career assists'],
  ['ppg', 'Points per game'],
  ['rpg', 'Rebounds per game'],
  ['apg', 'Assists per game'],
];

function valueOf(profile: GoatProfile, key: TapeRow['key']): number {
  if (key === 'allNba') return profile.allNbaSelections;
  return profile[key];
}

/** The stat-by-stat comparison between the player and a legend. */
export function buildTaleOfTheTape(user: GoatProfile, legend: GoatLegend): TaleOfTheTape {
  const legendProfile = profileOfLegend(legend);
  const rows: TapeRow[] = TAPE_KEYS.map(([key, label]) => {
    const u = valueOf(user, key);
    const l = valueOf(legendProfile, key);
    const leader: TapeRow['leader'] = u === l ? 'even' : u > l ? 'user' : 'legend';
    return { key, label, user: u, legend: l, leader };
  });
  return {
    legendId: legend.id,
    legendName: legend.name,
    rows,
    userScore: computeGoatScore(user),
    legendScore: computeGoatScore(legendProfile),
  };
}

export interface MilestoneGap {
  key: 'rings' | 'finalsMvps' | 'mvps' | 'allNba' | 'careerPoints';
  label: string;
  /** The amount the player still needs in this category. */
  needed: number;
}

export interface NextMilestone {
  /** The closest legend ranked above the player. Null when the player is the GOAT. */
  target: { legendId: string; name: string; goatScore: number } | null;
  /** Score points the player needs to pass the target. */
  scoreGap: number;
  /** Exact gaps, one per category, each on its own: any one of them alone is enough. */
  gaps: MilestoneGap[];
}

/**
 * The next legend to pass: the one with the lowest score above the player. Each gap is
 * the amount needed in that single category to close the score difference on its own.
 * Ties on score resolve by catalog order, so the result is stable.
 */
export function nextMilestone(user: GoatProfile, legends: GoatLegend[] = GOAT_LEGENDS): NextMilestone {
  const userScore = computeGoatScore(user);
  let target: { legend: GoatLegend; score: number } | null = null;
  for (const legend of legends) {
    const score = computeGoatScore(profileOfLegend(legend));
    if (score <= userScore) continue;
    if (!target || score < target.score) target = { legend, score };
  }
  if (!target) return { target: null, scoreGap: 0, gaps: [] };

  const scoreGap = Math.round((target.score - userScore) * 10) / 10;
  const w = GOAT_WEIGHTS;
  const perPoint = w.pointsPerThousand / 1000;
  const gaps: MilestoneGap[] = [
    { key: 'rings', label: 'rings', needed: Math.ceil(scoreGap / w.rings) },
    { key: 'finalsMvps', label: 'Finals MVPs', needed: Math.ceil(scoreGap / w.finalsMvps) },
    { key: 'mvps', label: 'MVPs', needed: Math.ceil(scoreGap / w.mvps) },
    { key: 'allNba', label: 'All-NBA selections', needed: Math.ceil(scoreGap / w.allNbaSelections) },
    { key: 'careerPoints', label: 'career points', needed: Math.ceil(scoreGap / perPoint) },
  ];
  return {
    target: { legendId: target.legend.id, name: target.legend.name, goatScore: target.score },
    scoreGap,
    gaps,
  };
}
