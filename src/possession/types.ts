import type { PlayerId, TeamId } from '../sim/core/types';

/** Court logical size in units. Matches the GDD's 940x500 half-court ratio (1.88:1). */
export const COURT_WIDTH = 940;
export const COURT_HEIGHT = 500;

/** Fixed simulation step: 60 Hz (ADR-003). */
export const STEP_MS = 1000 / 60;

/** A player or ball position on the court. Pure data, no rendering state. */
export interface CourtEntity {
  id: PlayerId | 'ball';
  teamId: TeamId | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface PossessionState {
  /** Simulation time in milliseconds, advanced only by fixed steps. */
  timeMs: number;
  /** Number of fixed steps run so far. */
  tick: number;
  /** Milliseconds not yet consumed by a fixed step (the accumulator). */
  accumulatorMs: number;
  /** True while a decision card is open. The clock does not advance. */
  paused: boolean;
  entities: CourtEntity[];
}
