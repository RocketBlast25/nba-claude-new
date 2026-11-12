import type { Contract, Player } from '../core/models';
import type { SeededRng } from '../core/random';
import type { TeamId } from '../core/types';
import { LEAGUE_CONFIG } from './leagueConfig';
import { capSpace, payrollOf, salaryForOverall } from './economy';

export interface RosterSlot {
  teamId: TeamId;
  player: Player;
}

/** Decrements contract years and returns the players whose deals expire this offseason. */
export function tickContracts(players: Player[]): { active: Player[]; expiring: Player[] } {
  const active: Player[] = [];
  const expiring: Player[] = [];
  for (const p of players) {
    const yearsLeft = p.contract.yearsLeft - 1;
    const next: Player = { ...p, contract: { ...p.contract, yearsLeft } };
    if (yearsLeft <= 0) expiring.push(next);
    else active.push(next);
  }
  return { active, expiring };
}

/** Builds a new contract at market salary for the given overall rating. */
export function marketContract(overall: number): Contract {
  return {
    salary: salaryForOverall(overall),
    yearsLeft: LEAGUE_CONFIG.contractYears.min,
    type: 'standard',
  };
}

/**
 * Re-signing decision for one expiring player. A team re-signs when the player's
 * overall is at least `threshold` and the deal fits under the cap. Deterministic
 * for a given RNG state: contract length is drawn from the configured range.
 */
export function resignDecision(
  player: Player,
  payroll: number,
  threshold: number,
  rng: SeededRng,
): Contract | null {
  if (player.overall < threshold) return null;
  const salary = salaryForOverall(player.overall);
  if (salary > capSpace(payroll)) return null;
  const { min, max } = LEAGUE_CONFIG.contractYears;
  return { salary, yearsLeft: rng.int(min, max), type: 'standard' };
}

/**
 * Advances one team's roster through the offseason: expiring contracts are either
 * re-signed or released to free agency, and the team's payroll is recomputed.
 */
export function advanceTeamOffseason(
  roster: Player[],
  threshold: number,
  rng: SeededRng,
): { roster: Player[]; freeAgents: Player[] } {
  const { active, expiring } = tickContracts(roster);
  const kept: Player[] = [...active];
  const freeAgents: Player[] = [];
  for (const p of expiring) {
    const payroll = payrollOf(kept.map((k) => k.contract.salary));
    const contract = resignDecision(p, payroll, threshold, rng);
    if (contract) kept.push({ ...p, contract });
    else freeAgents.push(p);
  }
  return { roster: kept, freeAgents };
}

/**
 * Free-agent signing: teams with cap space sign the best available free agents,
 * best overall first, while the market salary fits under the cap and the roster
 * stays within LEAGUE_CONFIG.maxRosterSize.
 */
export function signFreeAgents(
  payroll: number,
  rosterSize: number,
  freeAgents: Player[],
  maxSignings: number,
): { signed: Player[]; remaining: Player[]; payroll: number } {
  const pool = [...freeAgents].sort((a, b) => b.overall - a.overall || (a.id < b.id ? -1 : 1));
  const signed: Player[] = [];
  let total = payroll;
  const openSpots = LEAGUE_CONFIG.maxRosterSize - rosterSize;
  for (const fa of pool) {
    if (signed.length >= maxSignings || signed.length >= openSpots) break;
    const contract = marketContract(fa.overall);
    if (contract.salary > capSpace(total)) continue;
    signed.push({ ...fa, contract });
    total += contract.salary;
  }
  const signedIds = new Set(signed.map((s) => s.id));
  return { signed, remaining: pool.filter((p) => !signedIds.has(p.id)), payroll: total };
}
