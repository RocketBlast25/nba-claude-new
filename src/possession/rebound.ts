/**
 * Rebound resolution for Milestone 2. A missed shot lands on a point near the rim and
 * the player who wins it is decided by distance to that point plus rebounding ability.
 * Deterministic: the scramble is resolved by the caller's seeded roll, not here.
 */
import type { Vec } from './defense';
import { dist } from './defense';

export interface ReboundCandidate {
  id: string;
  /** Court position at the moment the ball comes off the rim. */
  pos: Vec;
  /** The player's `rebounding` attribute, 0–100. */
  rebounding: number;
  /** True when the player is on the shooting team. */
  offense: boolean;
}

export interface ReboundResult {
  winnerId: string;
  /** True when the winner is on the shooting team: an offensive rebound. */
  offensive: boolean;
}

/** Score for winning a rebound: closer and stronger players rank higher. */
export function reboundScore(candidate: ReboundCandidate, landing: Vec): number {
  const gap = dist(candidate.pos, landing);
  // A player 40 units from the landing spot is unlikely to get there first.
  const proximity = Math.max(0, 1 - gap / 40);
  return proximity * 0.6 + (candidate.rebounding / 100) * 0.4;
}

/**
 * Picks the rebound winner for a miss that lands at `landing`. Returns `null` only when
 * there are no candidates. Ties break by lower id so the result is deterministic.
 */
export function resolveRebound(
  candidates: ReboundCandidate[],
  landing: Vec,
): ReboundResult | null {
  if (candidates.length === 0) return null;
  let best = candidates[0]!;
  let bestScore = reboundScore(best, landing);
  for (const c of candidates.slice(1)) {
    const score = reboundScore(c, landing);
    if (score > bestScore || (score === bestScore && c.id < best.id)) {
      best = c;
      bestScore = score;
    }
  }
  return { winnerId: best.id, offensive: best.offense };
}
