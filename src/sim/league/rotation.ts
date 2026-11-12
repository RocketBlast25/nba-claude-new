import type { Player } from '../core/models';
import { LEAGUE_CONFIG } from './leagueConfig';

/** A team's rotation: an ordered list of players. The first `starters` start. */
export interface Rotation {
  playerIds: Player['id'][];
}

export type RotationCheck = { ok: true } | { ok: false; reason: string };

/**
 * Validates a rotation against a team roster. Every id must be on the roster,
 * appear once, and the rotation must have at least `starters` players and no
 * more than `maxPlayed`.
 */
export function checkRotation(playerIds: Player['id'][], roster: Player['id'][]): RotationCheck {
  const { starters, maxPlayed } = LEAGUE_CONFIG.rotation;
  if (new Set(playerIds).size !== playerIds.length) return { ok: false, reason: 'Rotation lists a player twice' };
  const onRoster = new Set(roster);
  if (playerIds.some((id) => !onRoster.has(id))) return { ok: false, reason: 'Rotation includes a non-roster player' };
  if (playerIds.length < starters) return { ok: false, reason: `Rotation needs at least ${starters} players` };
  if (playerIds.length > maxPlayed) return { ok: false, reason: `Rotation allows at most ${maxPlayed} players` };
  return { ok: true };
}

/** The starting lineup: the first `starters` players in the rotation order. */
export function startersOf(rotation: Rotation): Player['id'][] {
  return rotation.playerIds.slice(0, LEAGUE_CONFIG.rotation.starters);
}

/** Moves the player at `from` to `to`. Returns a new order; out-of-range indexes leave it unchanged. */
export function moveInRotation(playerIds: Player['id'][], from: number, to: number): Player['id'][] {
  if (from < 0 || from >= playerIds.length || to < 0 || to >= playerIds.length) return [...playerIds];
  const next = [...playerIds];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return [...playerIds];
  next.splice(to, 0, moved);
  return next;
}
