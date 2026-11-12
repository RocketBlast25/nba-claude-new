/** All Milestone 6 career tuning. Values are placeholders pending design sign-off. */
export const CAREER_CONFIG = {
  /** Progression by age band: [minAge, maxAge] -> base yearly change per attribute. */
  progression: {
    developmentMaxAge: 25,
    peakMaxAge: 29,
    developmentBase: 3,
    peakBase: 0,
    declineBase: -2,
    /** Extra yearly change scaled by (potential - overall), capped. */
    potentialPull: 0.1,
    potentialPullCap: 4,
    /** Uniform noise half-width added to each attribute change. */
    noise: 2,
  },
  /** Retirement rules. */
  retirement: {
    /** Players at or above this age always retire. */
    forcedAge: 38,
    /** Players at or above this age and below overall floor may retire. */
    lowOverallAge: 33,
    lowOverallFloor: 50,
    /** Chance to retire when in the low-overall band. */
    lowOverallChance: 0.5,
    /** Veteran age at which unsigned free agency counts toward retirement. */
    unsignedVeteranAge: 30,
    /** Consecutive unsigned offseasons that trigger retirement for a veteran. */
    unsignedOffseasonsToRetire: 2,
  },
  /** Off-court events and their effect on mood and chemistry (0 to 100 scale). */
  offCourt: {
    /** Chance per player per season of one event. */
    eventRate: 0.2,
    /** Maximum absolute mood or chemistry change from one event. */
    maxEffect: 8,
    /** Mood above this gives a progression bonus. */
    moodGrowthThreshold: 70,
    growthBonus: 1,
    /** Max salary modifier from mood in contract talks (fraction, e.g. 0.05 = 5%). */
    maxSalaryModifier: 0.05,
  },
  /** Key Moments per game. */
  keyMoments: {
    userGameMin: 2,
    userGameMax: 4,
    aiGameMax: 1,
  },
} as const;
