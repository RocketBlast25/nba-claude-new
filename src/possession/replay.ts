import { COURT_HEIGHT, COURT_WIDTH, type CourtEntity, type PossessionState } from './types';

/** One court frame for replay. Pure data, JSON-safe, deterministic for a given state. */
export interface CourtSnapshot {
  /** Simulation time in milliseconds. */
  t: number;
  ballPos: { x: number; y: number };
  players: { id: string; x: number; y: number }[];
}

const round = (n: number): number => Math.round(n * 100) / 100;

function clampToCourt(v: number, max: number): number {
  return round(Math.min(max, Math.max(0, v)));
}

/**
 * Captures the court at the state's current time. Positions are clamped to the
 * 940x500 court and rounded to 2 decimals so snapshots are stable across runs.
 */
export function snapshotCourt(state: PossessionState): CourtSnapshot {
  const ball = state.entities.find((e) => e.id === 'ball');
  const players = state.entities
    .filter((e: CourtEntity) => e.id !== 'ball')
    .map((e) => ({ id: String(e.id), x: clampToCourt(e.x, COURT_WIDTH), y: clampToCourt(e.y, COURT_HEIGHT) }));
  return {
    t: round(state.timeMs),
    ballPos: ball
      ? { x: clampToCourt(ball.x, COURT_WIDTH), y: clampToCourt(ball.y, COURT_HEIGHT) }
      : { x: 0, y: 0 },
    players,
  };
}
