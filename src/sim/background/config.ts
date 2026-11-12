/**
 * Data-driven defaults for the background simulator (Milestone 4). These are
 * starting values for tuning, not design-confirmed numbers.
 */
export const SIM_CONFIG = {
  /** League-average pace, possessions per 48 minutes. */
  leaguePace: 100,
  /** League-average offensive rating, points per 100 possessions. */
  leagueOffRating: 110,
  /** Each overtime period adds this many minutes (TR-background-sim-001). */
  overtimeMinutes: 5,
  regulationMinutes: 48,
  /** Stamina below this reduces minutes and performance (TR-background-sim-004). */
  staminaThreshold: 60,
  /** Minutes multiplier applied when stamina is below the threshold. */
  lowStaminaMinutesFactor: 0.85,
  /** Fouls at which a player's minutes are reduced (foul trouble). */
  foulTroubleFouls: 4,
  foulTroubleMinutesFactor: 0.7,
  /** Per-possession foul chance for a defender, before the defense adjustment. */
  baseFoulRate: 0.03,
  /** Baseline make chance on a three-point attempt before the 3PT rating adjustment. */
  baseThreePct: 0.36,
  /** Baseline free-throw make chance before the free-throw rating adjustment. */
  baseFtPct: 0.77,
  /** Chance a missed shot is blocked by a defender. */
  blockBaseRate: 0.1,
  /** Baseline turnover chance on a no-shot possession, before ball-handling adjustment. */
  baseTurnoverRate: 0.14,
  /** Baseline steal chance on a turnover before defense and speed adjustment. */
  baseStealRate: 1.0,
  /** Share of possessions that end in a shot (the rest are turnovers). */
  shotPossessionRate: 0.96,
  /** Baseline make chance per shot before the finishing adjustment. */
  baseFgPct: 0.46,
  /** Chance a made shot is a three (worth 3). */
  threePointShare: 0.36,
  /** Share of made field goals that are assisted (team assisted-FGM rate cap). */
  assistedFgmRate: 0.6,
  /** Season length and schedule shape. */
  gamesPerTeam: 82,
  /** Accepted league-average ranges over many seasons (TR-background-sim-007). */
  bounds: {
    pointsPerTeamGame: [100, 125] as const,
    fgPct: [0.42, 0.5] as const,
    reboundsPerTeamGame: [35, 55] as const,
    stealsPerTeamGame: [5, 11] as const,
    blocksPerTeamGame: [3, 8] as const,
    turnoversPerTeamGame: [10, 20] as const,
    threePct: [0.3, 0.42] as const,
    ftPct: [0.7, 0.85] as const,
  },
} as const;

export type SimConfig = typeof SIM_CONFIG;
