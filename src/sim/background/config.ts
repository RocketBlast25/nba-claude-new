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
  },
} as const;

export type SimConfig = typeof SIM_CONFIG;
