/**
 * Pure ball physics for Milestone 2. The court is 2D; `z` is the ball's height above
 * the floor, in court units. Shots and passes follow parabolic arcs, misses bounce
 * off the rim with damping, and passes can be intercepted by defenders near the
 * pass line. No RNG: every function is a deterministic function of its inputs.
 */
import type { Vec } from './defense';
import { dist } from './defense';

/** Gravity in court-units per second squared, tuned for readable arcs at 60 Hz. */
export const GRAVITY = 900;
/** Vertical speed retained after each rim bounce (0 = dead, 1 = perfect). */
export const RIM_RESTITUTION = 0.45;
/** Radius of the rim, in court units. */
export const RIM_RADIUS = 9;

/** Pass styles. Chest passes are fast and flat; lobs are slow and high. */
export type PassStyle = 'chest' | 'skip' | 'lob';

/** Peak height (z) and speed for each pass style. Speed is court units per second. */
export const PASS_PROFILE: Record<PassStyle, { apex: number; speed: number }> = {
  chest: { apex: 12, speed: 620 },
  skip: { apex: 26, speed: 480 },
  lob: { apex: 90, speed: 300 },
};

/**
 * Height of a ball on a parabola from z=0 at `u`=0 to z=0 at `u`=1, peaking at `apex`
 * when `u`=0.5. `u` is clamped to [0, 1].
 */
export function arcHeight(u: number, apex: number): number {
  const c = Math.min(1, Math.max(0, u));
  return 4 * apex * c * (1 - c);
}

/**
 * Flight time in seconds for a pass or shot that covers `distance` court units at
 * `speed` units per second. Zero speed or distance returns zero.
 */
export function flightTime(distance: number, speed: number): number {
  return speed > 0 ? distance / speed : 0;
}

/**
 * Pass-lane interception. Returns a value in [0, 1] for how exposed the pass is:
 * the strongest defender close to the pass segment (between passer and receiver)
 * sets the risk. A defender beyond `laneWidth` contributes nothing. Lobs are only
 * exposed while in the air at their slowest: low passes are most exposed to a defender
 * right on the line, lobs to a jump-ready defender near the middle of the flight.
 */
export function laneInterceptRisk(
  passer: Vec,
  receiver: Vec,
  defenders: Vec[],
  style: PassStyle,
  laneWidth = 30,
): number {
  const dx = receiver.x - passer.x;
  const dy = receiver.y - passer.y;
  const len2 = dx * dx + dy * dy || 1;
  let best = 0;
  for (const d of defenders) {
    // Project the defender onto the pass segment, clamped to the segment.
    const t = Math.min(1, Math.max(0, ((d.x - passer.x) * dx + (d.y - passer.y) * dy) / len2));
    const onLine = { x: passer.x + dx * t, y: passer.y + dy * t };
    const gap = dist(d, onLine);
    if (gap >= laneWidth) continue;
    const closeness = 1 - gap / laneWidth;
    // A lob hangs in the air, so a defender reaching the line mid-flight is the real threat.
    // Weight it by how close the defender's projection is to the midpoint of the flight.
    const midWeight = 1 - Math.abs(t - 0.5) * 2;
    const risk = closeness * (style === 'lob' ? 0.45 + 0.55 * midWeight : 1);
    if (risk > best) best = risk;
  }
  return Math.round(best * 1000) / 1000;
}

/**
 * Bounces the ball off the rim: the vertical speed reverses and loses energy by
 * RIM_RESTITUTION. Returns the new vertical velocity and a flag for whether the
 * bounce is still lively enough to continue (speed above `minSpeed`). Pure.
 */
export function rimBounce(vz: number, minSpeed = 40): { vz: number; alive: boolean } {
  const next = -vz * RIM_RESTITUTION;
  return { vz: next, alive: Math.abs(next) > minSpeed };
}
