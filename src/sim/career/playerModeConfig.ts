import type { TeamId } from '../core/types';

/** Player Career Mode tuning. Values are placeholders pending design sign-off. */
export const PLAYER_MODE_CONFIG = {
  role: {
    /** Minimum overall for the top roster player to count as franchise. */
    franchiseOverall: 75,
    /** Roster ranks at or below this (and not starting) are sixth man. */
    sixthManMaxRank: 6,
  },
  initial: {
    coachTrust: 50,
    happiness: 60,
    ambitionBase: 30,
    ambitionPerOverall: 0.5,
  },
  happiness: {
    baseline: 50,
    /** Target offset by role. */
    roleBonus: {
      bench: -15,
      sixth_man: -5,
      starter: 5,
      franchise: 15,
    },
    /** Points of target per point of trust above 50. */
    trustWeight: 0.3,
    ambitionWeight: 1,
    successBarScale: 0.5,
    /** Points of target per point of win fraction above the bar. */
    successWeight: 60,
    /** Fraction of the gap to target closed each season. */
    adjustRate: 0.5,
  },
  trade: {
    /** Consecutive seasons below the unhappy threshold before a trade request. */
    unhappySeasonsToRequest: 2,
    unhappyThreshold: 35,
  },
  keyMoments: {
    /** Clutch fourth: final margin at or below this (score differential <= 5). */
    clutchMaxDiff: 5,
    /** Game-winner: final margin at or below this (score differential <= 3). */
    gameWinnerMaxDiff: 3,
    /** Cap on regular-season user moments per season. Playoff games are never capped. */
    maxRegularSeasonMoments: 12,
    /** Configured rivalry pairs of team ids. Empty until the league defines them. */
    rivalries: [] as [TeamId, TeamId][],
  },
  objectives: {
    minCount: 2,
    maxCount: 3,
    /** Overall at which the base targets apply without adjustment. */
    overallBaseline: 70,
    /** Coach trust change per met or missed objective. */
    trustPerMet: 3,
    trustPerMissed: 2,
    /** Attribute XP granted per met objective. */
    xpPerMet: 1,
    catalog: [
      {
        id: 'points_per_game',
        label: 'Points per game',
        base: { bench: 6, sixth_man: 10, starter: 14, franchise: 20 },
        perOverall: 0.4,
      },
      {
        id: 'assists_per_game',
        label: 'Assists per game',
        base: { bench: 1, sixth_man: 2, starter: 3, franchise: 5 },
        perOverall: 0.1,
      },
      {
        id: 'fg_pct',
        label: 'Field goal percentage',
        base: { bench: 0.4, sixth_man: 0.43, starter: 0.45, franchise: 0.48 },
        perOverall: 0.001,
      },
      {
        id: 'win_pct',
        label: 'Team win percentage',
        base: { bench: 0.4, sixth_man: 0.5, starter: 0.55, franchise: 0.6 },
        perOverall: 0,
      },
    ],
  },
} as const;
