/**
 * Man-to-man defensive AI and shot contest. Pure geometry: no React, no DOM,
 * no RNG. Every function takes plain positions and returns plain numbers, so
 * the same inputs always give the same defensive movement.
 */
import { COURT_HEIGHT, COURT_WIDTH } from './types';

export interface Vec {
  x: number;
  y: number;
}

/** The hoop each side defends: the basket at the end of the court it guards. */
export const HOOP_LEFT: Vec = { x: 52.5, y: COURT_HEIGHT / 2 };
export const HOOP_RIGHT: Vec = { x: COURT_WIDTH - 52.5, y: COURT_HEIGHT / 2 };

/** Distance, in court units, a defender keeps between itself and its man when goal-side. */
export const GOAL_SIDE_GAP = 26;
/** Radius of a close-out: a defender runs at a shooter from this far away. */
export const CLOSEOUT_RANGE = 90;
/** Maximum distance a shot can be contested from. Beyond this a contest is zero. */
export const CONTEST_RANGE = 80;

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Moves `from` toward `to` by at most `maxStep` units. */
export function moveToward(from: Vec, to: Vec, maxStep: number): Vec {
  const d = dist(from, to);
  if (d <= maxStep || d === 0) return { x: to.x, y: to.y };
  const k = maxStep / d;
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
}

/**
 * The point a man-defender should occupy: between the attacker and the hoop it
 * guards, `GOAL_SIDE_GAP` units off the attacker. A man far from the ball or the
 * hoop is still tied to the goal-side line, so the defender never lets its man
 * slip behind it toward the basket.
 */
export function goalSideSpot(attacker: Vec, hoop: Vec): Vec {
  const d = dist(attacker, hoop);
  if (d === 0) return { x: attacker.x, y: attacker.y };
  const k = Math.min(GOAL_SIDE_GAP, d) / d;
  return { x: attacker.x + (hoop.x - attacker.x) * k, y: attacker.y + (hoop.y - attacker.y) * k };
}

/**
 * Where a defender "hedges" against a ball screen: it steps out toward the ball
 * handler, staying a few units off the screener, instead of trailing the handler
 * through the screen. `hedgeFactor` in [0, 1] sets how far it steps out (0 = stays
 * on its man, 1 = fully on the ball).
 */
export function hedgeSpot(defender: Vec, handler: Vec, screener: Vec, hedgeFactor: number): Vec {
  const f = Math.min(1, Math.max(0, hedgeFactor));
  const onScreen = { x: screener.x + (handler.x - screener.x) * 0.25, y: screener.y + (handler.y - screener.y) * 0.25 };
  return {
    x: onScreen.x + (defender.x - onScreen.x) * (1 - f),
    y: onScreen.y + (defender.y - onScreen.y) * (1 - f),
  };
}

/**
 * Help position for a defender whose man is not the ball: slides toward the lane
 * between the drive and the hoop, by `helpFactor` in [0, 1] of the way from its
 * spot to the drive's path. Used when the ball drives into the paint.
 */
export function helpSpot(defender: Vec, driver: Vec, hoop: Vec, helpFactor: number): Vec {
  const f = Math.min(1, Math.max(0, helpFactor));
  const laneX = driver.x + (hoop.x - driver.x) * 0.5;
  const laneY = driver.y + (hoop.y - driver.y) * 0.5;
  return { x: defender.x + (laneX - defender.x) * f, y: defender.y + (laneY - defender.y) * f };
}

/**
 * Shot contest quality in [0, 1] at the exact moment of release. The contest is
 * the sum of three parts, each scaled to [0, 1] and clamped:
 *  - distance: a defender within `CONTEST_RANGE` contests; closer is stronger;
 *  - closing: a defender running at the shooter (closing speed) adds to it;
 *  - angle: a defender standing in front of the shot line (between shooter and hoop)
 *    contests better than one trailing from the side.
 * Returns 0 when no defender is within range. Pure and deterministic.
 */
export function shotContest(shooter: Vec, shooterVel: Vec, hoop: Vec, defenders: { pos: Vec; vel: Vec }[]): number {
  let best = 0;
  for (const d of defenders) {
    const gap = dist(shooter, d.pos);
    if (gap >= CONTEST_RANGE) continue;
    const proximity = 1 - gap / CONTEST_RANGE;

    // Closing speed: how fast the defender moves toward the shooter, relative to the shooter.
    const rx = shooter.x - d.pos.x;
    const ry = shooter.y - d.pos.y;
    const rLen = Math.hypot(rx, ry) || 1;
    const relVx = d.vel.x - shooterVel.x;
    const relVy = d.vel.y - shooterVel.y;
    // (rx, ry) points from defender to shooter, so a positive projection means closing.
    const closing = Math.max(0, (relVx * rx + relVy * ry) / rLen);
    const closingPart = Math.min(1, closing / 60);

    // Angle: how much the defender sits on the shot line. Dot of the direction from
    // shooter to defender against the direction from shooter to hoop; 1 = directly in front.
    const hx = hoop.x - shooter.x;
    const hy = hoop.y - shooter.y;
    const hLen = Math.hypot(hx, hy) || 1;
    const facing = (-(rx * hx + ry * hy)) / (rLen * hLen);
    const anglePart = Math.max(0, facing);

    const contest = Math.min(1, proximity * 0.6 + closingPart * 0.2 + anglePart * 0.2);
    if (contest > best) best = contest;
  }
  return Math.round(best * 1000) / 1000;
}
