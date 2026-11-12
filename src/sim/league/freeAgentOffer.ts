import type { Contract, Player } from '../core/models';
import { capSpace, payrollOf } from './economy';
import { LEAGUE_CONFIG } from './leagueConfig';
import { marketContract } from './offseason';

export type OfferResult =
  | { ok: true; contract: Contract; payroll: number }
  | { ok: false; reason: string };

/**
 * Evaluates a free-agent offer for a team. The offer uses the market contract for
 * the player's overall rating, the salary must fit in cap space, and the roster
 * must have an open spot.
 */
export function evaluateOffer(args: {
  player: Player;
  roster: Player[];
}): OfferResult {
  const { player, roster } = args;
  if (roster.length >= LEAGUE_CONFIG.maxRosterSize) return { ok: false, reason: 'Roster is full' };
  const contract = marketContract(player.overall);
  const payroll = payrollOf(roster.map((p) => p.contract.salary));
  if (contract.salary > capSpace(payroll)) return { ok: false, reason: 'Not enough cap space for this offer' };
  return { ok: true, contract, payroll: payroll + contract.salary };
}
