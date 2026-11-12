/** Data-driven constants for playoffs, draft, and economy (Milestone 5 Part B). */
export const LEAGUE_CONFIG = {
  /** Play-in seeds per conference (7th through 10th). */
  playInSeeds: [7, 8, 9, 10] as const,
  /** Playoff series home-court pattern for a best-of-7 (2-2-1-1-1). */
  homePattern: [true, true, false, false, true, false, true] as const,
  /** Lottery odds (per mille, sum 1000) for the 14 non-playoff teams, worst record first. */
  lotteryOdds: [140, 140, 140, 125, 105, 90, 75, 60, 45, 33, 25, 15, 10, 7] as const,
  /** Number of picks decided by the weighted lottery. */
  lotteryPicks: 4,
  /** Total first-round picks. */
  draftRounds: 30,
  /** Prospect tiers: share of each class and rating band (inclusive). */
  prospectTiers: [
    { share: 0.1, overall: [70, 76] as const },
    { share: 0.3, overall: [62, 69] as const },
    { share: 0.6, overall: [50, 61] as const },
  ],
  /** Salary scale: rookie-scale salary for the top pick, and the minimum/maximum salary. */
  salary: {
    minimum: 1100,
    maximum: 45000,
    rookieTop: 9000,
    rookieFloor: 1200,
    /** Overall rating at which salary reaches the maximum. */
    maxAtOverall: 85,
    /** Overall rating at which salary reaches the minimum. */
    minAtOverall: 45,
  },
  /** Soft salary cap and luxury tax line, in thousands of dollars. */
  cap: {
    salaryCap: 140000,
    luxuryTaxLine: 170000,
    /** Tax rate applied to payroll above the luxury tax line. */
    luxuryTaxRate: 1.5,
  },
  /** Maximum players on a roster, enforced when signing free agents. */
  maxRosterSize: 15,
  /** Contract length bounds for re-signings and free-agent deals. */
  contractYears: { min: 1, max: 5 },
} as const;

export type LeagueConfig = typeof LEAGUE_CONFIG;
