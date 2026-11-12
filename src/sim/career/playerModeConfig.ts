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
} as const;
