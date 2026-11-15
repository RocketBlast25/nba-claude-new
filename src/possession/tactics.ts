/**
 * Tick-based tactical possession stepper. Pure: `stepTactics` returns new positions
 * for one fixed step and never mutates its input. Movement is limited by each
 * player's speed and acceleration, so motion reads as real basketball rather than
 * linear interpolation between scripted keyframes.
 *
 * Determinism comes from the caller: the spacing set, starting positions and any
 * randomness are chosen once by the seeded setup. This module draws no RNG.
 */
import { STEP_MS } from './types';
import {
  dist,
  goalSideSpot,
  helpSpot,
  hedgeSpot,
  type Vec,
  HOOP_LEFT,
  HOOP_RIGHT,
  CLOSEOUT_RANGE,
} from './defense';

/** Spacing sets the offense can run. Each assigns a target spot to every offensive role. */
export type SpacingSet = 'five_out' | 'four_out_one_in' | 'horns' | 'pick_and_roll';

/** Speeds in court units per second. The ball handler dribbles unless it sprints. */
export const DRIBBLE_SPEED = 120;
export const SPRINT_SPEED = 230;
export const DEFENDER_SPEED = 210;
/** Max change in speed per second: acceleration and deceleration limit. */
export const ACCEL = 620;

/** A tactical player: position, velocity and a role in the spacing set. */
export interface TacticalPlayer {
  id: string;
  side: 'offense' | 'defense';
  pos: Vec;
  vel: Vec;
  /** Offensive role index in the spacing set (0 = ball handler). Defenders use `guards`. */
  role: number;
  /** For defenders, the id of the offensive player they guard. */
  guards?: string;
  /** Speed the player can reach, in court units per second. */
  topSpeed: number;
}

export interface TacticalState {
  players: TacticalPlayer[];
  /** The ball handler's id. */
  handlerId: string;
  spacing: SpacingSet;
  /** Simulation time in ms, advanced by STEP_MS per call. */
  timeMs: number;
}

/**
 * Target spot for each offensive role, in the frame of the court the offense is
 * attacking. Role 0 is the ball handler. Roles 1-4 space the floor per the set.
 * The spots are fixed for a set; the stepper moves players toward them.
 */
export function offenseSpot(spacing: SpacingSet, role: number, attackingRight: boolean): Vec {
  const s = attackingRight ? 1 : -1;
  const at = (dx: number, y: number): Vec => ({ x: 470 + s * dx, y });
  switch (spacing) {
    case 'five_out':
      // Five-out: four on the arc and a wing, all outside the paint.
      return [at(-200, 250), at(120, 70), at(120, 430), at(230, 120), at(230, 380)][role] ?? at(0, 250);
    case 'four_out_one_in':
      // Four on the perimeter and a post on the block.
      return [at(-200, 250), at(110, 60), at(110, 440), at(230, 150), at(-60, 250)][role] ?? at(0, 250);
    case 'horns':
      // Two bigs at the elbows of the free-throw line, guards wide.
      return [at(-200, 250), at(-40, 150), at(-40, 350), at(150, 70), at(150, 430)][role] ?? at(0, 250);
    case 'pick_and_roll':
      // Ball handler at the top, screener high, three spacers.
      return [at(-120, 250), at(-60, 230), at(120, 60), at(120, 440), at(200, 250)][role] ?? at(0, 250);
  }
}

/**
 * Speed a player should aim for this step. The ball handler dribbles at
 * DRIBBLE_SPEED while it has space, and sprints toward the hoop when a
 * defender is close (a drive). Other players run at top speed toward their spot.
 */
export function targetSpeed(p: TacticalPlayer, nearestDefender: number): number {
  if (p.side === 'offense' && p.role === 0) {
    return nearestDefender < 40 ? SPRINT_SPEED : DRIBBLE_SPEED;
  }
  return p.topSpeed;
}

/**
 * Advances velocity toward the desired velocity within the ACCEL limit, so a
 * player can't stop or turn instantly. Returns the new velocity.
 */
export function steerVelocity(current: Vec, desired: Vec, dtSec: number): Vec {
  const dvx = desired.x - current.x;
  const dvy = desired.y - current.y;
  const dv = Math.hypot(dvx, dvy);
  const maxDv = ACCEL * dtSec;
  if (dv <= maxDv || dv === 0) return { x: desired.x, y: desired.y };
  const k = maxDv / dv;
  return { x: current.x + dvx * k, y: current.y + dvy * k };
}

/**
 * Picks the desired position for one player this step. Offense moves to its
 * spacing spot, cutting off a screener's pick. Defense plays man-to-man: goal-side
 * on its man, hedging when the man is the handler and a screen is set, closing out
 * on shooters, and helping when the handler is driving inside.
 */
export function desiredPosition(state: TacticalState, p: TacticalPlayer, attackingRight: boolean): Vec {
  const hoop = attackingRight ? HOOP_RIGHT : HOOP_LEFT;
  const handler = state.players.find((q) => q.id === state.handlerId) ?? p;
  if (p.side === 'offense') {
    if (p.role === 0) {
      // The handler attacks the hoop when open, otherwise keeps its spot.
      return dist(p.pos, hoop) > 220 ? offenseSpot(state.spacing, 0, attackingRight) : hoop;
    }
    return offenseSpot(state.spacing, p.role, attackingRight);
  }
  const man = state.players.find((q) => q.id === p.guards) ?? handler;
  // Close out on a shooter: the defender runs at it when it is inside the close-out range.
  if (man.id !== handler.id && dist(man.pos, handler.pos) > CLOSEOUT_RANGE) {
    return goalSideSpot(man.pos, hoop);
  }
  if (man.id === handler.id) {
    return goalSideSpot(handler.pos, hoop);
  }
  // Help when the handler is driving into the paint.
  const drivingInside = dist(handler.pos, hoop) < 160;
  if (drivingInside) {
    return helpSpot(p.pos, handler.pos, hoop, 0.35);
  }
  const screener = state.players.find((q) => q.side === 'offense' && q.role !== 0 && dist(q.pos, handler.pos) < 36);
  if (screener) {
    return hedgeSpot(p.pos, handler.pos, screener.pos, 0.5);
  }
  return goalSideSpot(man.pos, hoop);
}

/**
 * Advances the tactical state by one fixed step (STEP_MS). Each player's velocity
 * steers toward its desired position at its target speed, then the position
 * integrates. Pure: returns a new state.
 */
export function stepTactics(state: TacticalState, attackingRight: boolean): TacticalState {
  const dtSec = STEP_MS / 1000;
  const next = state.players.map((p) => {
    const handler = state.players.find((q) => q.id === state.handlerId) ?? p;
    const nearestDefender = p.side === 'offense'
      ? Math.min(...state.players.filter((q) => q.side === 'defense').map((q) => dist(q.pos, p.pos)))
      : dist(p.pos, handler.pos);
    const goal = desiredPosition(state, p, attackingRight);
    const speed = Math.min(p.topSpeed, targetSpeed(p, nearestDefender));
    const desired = (() => {
      const d = dist(p.pos, goal);
      if (d === 0) return { x: 0, y: 0 };
      const k = Math.min(speed, d / dtSec) / d;
      return { x: (goal.x - p.pos.x) * k, y: (goal.y - p.pos.y) * k };
    })();
    const vel = steerVelocity(p.vel, desired, dtSec);
    const pos = { x: p.pos.x + vel.x * dtSec, y: p.pos.y + vel.y * dtSec };
    return { ...p, pos, vel };
  });
  return { ...state, players: next, timeMs: state.timeMs + STEP_MS };
}

