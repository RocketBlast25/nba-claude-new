import type { Player } from '../core/models';
import type { SeededRng } from '../core/random';
import { CAREER_CONFIG } from './careerConfig';
import type { OffCourtEvent, OffCourtKind } from './types';

const KINDS: OffCourtKind[] = ['media', 'injury_rumor', 'community', 'contract_talk', 'teammate_conflict'];

const clamp100 = (v: number): number => Math.min(100, Math.max(0, v));

/**
 * Rolls off-court events for one player this season. The event kind is drawn
 * uniformly; effects are bounded by CAREER_CONFIG.offCourt.maxEffect.
 */
export function rollOffCourtEvent(player: Player, season: number, rng: SeededRng): OffCourtEvent | null {
  if (!rng.chance(CAREER_CONFIG.offCourt.eventRate)) return null;
  const max = CAREER_CONFIG.offCourt.maxEffect;
  const kind = rng.pick(KINDS);
  return {
    id: `${season}-${player.id}-${kind}`,
    kind,
    playerId: player.id,
    season,
    moodDelta: Math.round(rng.range(-max, max)),
    chemistryDelta: Math.round(rng.range(-max, max) / 2),
  };
}

/** Applies an event to a mood/chemistry pair, clamped to 0-100. */
export function applyEvent(
  mood: number,
  chemistry: number,
  event: OffCourtEvent,
): { mood: number; chemistry: number } {
  return {
    mood: clamp100(mood + event.moodDelta),
    chemistry: clamp100(chemistry + event.chemistryDelta),
  };
}

/** Salary multiplier in contract talks: happier players ask less, capped by config. */
export function moodSalaryModifier(mood: number): number {
  const max = CAREER_CONFIG.offCourt.maxSalaryModifier;
  const centred = (clamp100(mood) - 50) / 50;
  return 1 - centred * max;
}
