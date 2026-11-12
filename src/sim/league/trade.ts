import type { Player } from '../core/models';
import { LEAGUE_CONFIG } from './leagueConfig';
import { payrollOf } from './economy';

/** Result of a trade check. A discriminated union, so callers narrow on `ok`. */
export type TradeCheck = { ok: true } | { ok: false; reason: string };

/**
 * Salary-matching check for one side of a trade. A side that receives no more
 * salary than it sends is always fine. Otherwise incoming salary must fit within
 * `outgoing * incomingRatio + buffer`, per LEAGUE_CONFIG.trade.
 */
export function salaryMatchesFor(outgoing: number, incoming: number): TradeCheck {
  if (incoming <= outgoing) return { ok: true };
  const { incomingRatio, buffer } = LEAGUE_CONFIG.trade;
  const limit = outgoing * incomingRatio + buffer;
  if (incoming <= limit) return { ok: true };
  return { ok: false, reason: `Incoming salary ${incoming} exceeds the ${Math.round(limit)} limit` };
}

/**
 * Validates a two-team trade. `sendA` goes from team A to team B and `sendB` the
 * reverse. Each side must match salaries and end within the roster limit.
 */
export function checkTrade(args: {
  sendA: Player[];
  sendB: Player[];
  rosterA: number;
  rosterB: number;
}): TradeCheck {
  const { sendA, sendB, rosterA, rosterB } = args;
  if (sendA.length === 0 && sendB.length === 0) return { ok: false, reason: 'Trade sends no players' };

  const salaryA = payrollOf(sendA.map((p) => p.contract.salary));
  const salaryB = payrollOf(sendB.map((p) => p.contract.salary));

  // Team A receives sendB and sends sendA; team B is the mirror.
  const matchA = salaryMatchesFor(salaryA, salaryB);
  if (!matchA.ok) return { ok: false, reason: `Team A: ${matchA.reason}` };
  const matchB = salaryMatchesFor(salaryB, salaryA);
  if (!matchB.ok) return { ok: false, reason: `Team B: ${matchB.reason}` };

  const afterA = rosterA - sendA.length + sendB.length;
  const afterB = rosterB - sendB.length + sendA.length;
  if (afterA > LEAGUE_CONFIG.maxRosterSize) return { ok: false, reason: 'Team A roster would exceed the limit' };
  if (afterB > LEAGUE_CONFIG.maxRosterSize) return { ok: false, reason: 'Team B roster would exceed the limit' };
  return { ok: true };
}
