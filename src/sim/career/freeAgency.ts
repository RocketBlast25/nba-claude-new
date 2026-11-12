import type { Contract, Player, Team } from '../core/models';
import type { SeededRng } from '../core/random';
import type { PlayerId, TeamId } from '../core/types';
import { capSpace, payrollOf, salaryForOverall } from '../league/economy';
import { LEAGUE_CONFIG } from '../league/leagueConfig';
import { checkTrade } from '../league/trade';
import { moodSalaryModifier } from './offCourt';
import { PLAYER_MODE_CONFIG } from './playerModeConfig';
import { shouldRequestTrade } from './playerMode';
import type { CareerState } from './types';

/** A player's career priority. Drives how offers are ranked. */
export type CareerPriority = 'max_money' | 'ring_chasing' | 'market_size';

/** One team's contract offer to a player. */
export interface PlayerOffer {
  teamId: TeamId;
  salary: number;
  years: number;
  /** Average overall of the team's roster. */
  teamOverall: number;
  marketSize: number;
  /** Role the player would expect on that roster. */
  projectedRole: 'bench' | 'sixth_man' | 'starter' | 'franchise';
}

/** Outcome of one contract offer. The player either accepts, counters, or rejects. */
export type NegotiationResult =
  | { kind: 'accepted'; contract: Contract }
  | { kind: 'counter'; ask: number }
  | { kind: 'rejected'; ask: number };

/**
 * The player's ask for a contract: market salary adjusted by mood. Happier players
 * ask less, bounded by offCourt.maxSalaryModifier.
 */
export function playerAsk(overall: number, mood: number): number {
  return Math.round(salaryForOverall(overall) * moodSalaryModifier(mood));
}

/**
 * Evaluates one offer against the player's ask. An offer close enough is accepted;
 * a near offer gets a counter that closes part of the gap; anything else is rejected.
 */
export function negotiateOffer(
  player: Player,
  mood: number,
  offer: number,
  yearsLeft: number,
): NegotiationResult {
  const ask = playerAsk(player.overall, mood);
  const n = PLAYER_MODE_CONFIG.negotiation;
  const ratio = offer / ask;
  if (ratio >= n.acceptRatio) {
    return { kind: 'accepted', contract: { salary: offer, yearsLeft, type: 'standard' } };
  }
  if (ratio >= n.counterRatio) {
    const counter = Math.round(offer + (ask - offer) * n.counterStep);
    return { kind: 'counter', ask: counter };
  }
  return { kind: 'rejected', ask };
}

/**
 * How much the user's roster needs this player's overall. Measured against the
 * weakest rotation slot (the 8th best player): a player above it adds the most.
 */
export function rosterNeed(overall: number, rosterOveralls: number[]): number {
  if (rosterOveralls.length === 0) return 1;
  const sorted = [...rosterOveralls].sort((a, b) => b - a);
  const weakest = sorted[Math.min(7, sorted.length - 1)] ?? 0;
  const gap = overall - weakest;
  return Math.min(1, Math.max(0, gap / 20));
}

/**
 * Priority score for one free agent from the user's point of view, between 0 and 1.
 * Combines overall, roster need, and value (overall per dollar of market salary).
 */
export function freeAgentPriority(
  player: Player,
  rosterOveralls: number[],
  capSpaceAvailable: number,
): number {
  const w = PLAYER_MODE_CONFIG.freeAgency.weights;
  const overallScore = Math.min(1, Math.max(0, player.overall / 100));
  const need = rosterNeed(player.overall, rosterOveralls);
  const salary = salaryForOverall(player.overall);
  const affordable = salary <= capSpaceAvailable ? 1 : 0;
  const value = affordable * overallScore;
  return w.overall * overallScore + w.need * need + w.value * value;
}

/**
 * Ranks free agents for the user by priority, highest first. Players whose mood is
 * below the signing threshold are excluded: they will not sign with the user.
 */
export function rankFreeAgents(
  freeAgents: { player: Player; mood: number }[],
  rosterOveralls: number[],
  capSpaceAvailable: number,
): { player: Player; mood: number; priority: number }[] {
  const min = PLAYER_MODE_CONFIG.freeAgency.minMoodToSign;
  return freeAgents
    .filter((f) => f.mood >= min)
    .map((f) => ({ ...f, priority: freeAgentPriority(f.player, rosterOveralls, capSpaceAvailable) }))
    .sort((a, b) => b.priority - a.priority || (a.player.id < b.player.id ? -1 : 1));
}

/** Team facts used for offers. Read from state.teams when present, otherwise derived from rosters. */
/**
 * True when the offer's salary fits under the team's cap. Checked only when team
 * metadata is present; without it the offer always fits, as before.
 */
export function offerFitsCap(state: CareerState, offer: PlayerOffer): boolean {
  if (!state.teams) return true;
  return offer.salary <= capSpace(teamFacts(state, offer.teamId).payroll);
}

function teamFacts(state: CareerState, teamId: TeamId): { payroll: number; overall: number; marketSize: number; rosterSize: number } {
  const ids = state.rosters[teamId] ?? [];
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const roster = ids.map((id) => byId.get(id)).filter((p): p is Player => p !== undefined);
  const team: Team | undefined = state.teams?.find((t) => t.id === teamId);
  const payroll = payrollOf(roster.map((p) => p.contract.salary));
  const overall = roster.length === 0 ? 0 : roster.reduce((s, p) => s + p.overall, 0) / roster.length;
  return {
    payroll: team ? team.payroll : payroll,
    overall,
    marketSize: team ? team.marketSize : 50,
    rosterSize: roster.length,
  };
}

/** Projected role on a team from the player's overall relative to the team's average. */
function projectedRoleFor(playerOverall: number, teamOverall: number): PlayerOffer['projectedRole'] {
  const gap = playerOverall - teamOverall;
  if (gap >= 10) return 'franchise';
  if (gap >= 3) return 'starter';
  if (gap >= -3) return 'sixth_man';
  return 'bench';
}

/**
 * Contract offers from every AI team with enough cap space and roster room. Salary
 * scales around the market salary: a team with more need for the player offers more,
 * and a larger market offers a small premium. Deterministic for a given state and RNG.
 */
export function generatePlayerOffers(
  state: CareerState,
  player: Player,
  rng: SeededRng,
): PlayerOffer[] {
  const base = salaryForOverall(player.overall);
  const offers: PlayerOffer[] = [];
  for (const teamId of Object.keys(state.rosters) as TeamId[]) {
    if (teamId === state.userTeamId) continue;
    const facts = teamFacts(state, teamId);
    if (facts.rosterSize >= LEAGUE_CONFIG.maxRosterSize) continue;
    const room = capSpace(facts.payroll);
    const rosterOveralls = (state.rosters[teamId] ?? [])
      .map((id) => state.players.find((p) => p.id === id)?.overall ?? 0);
    const need = rosterNeed(player.overall, rosterOveralls);
    const marketPremium = (facts.marketSize - 50) / 500;
    const jitter = rng.range(-0.02, 0.02);
    const salary = Math.round(base * (1 + need * 0.15 + marketPremium + jitter));
    if (salary > room) continue;
    const { min, max } = LEAGUE_CONFIG.contractYears;
    offers.push({
      teamId,
      salary,
      years: rng.int(min, max),
      teamOverall: Math.round(facts.overall),
      marketSize: facts.marketSize,
      projectedRole: projectedRoleFor(player.overall, facts.overall),
    });
  }
  return offers.sort((a, b) => b.salary - a.salary || (a.teamId < b.teamId ? -1 : 1));
}

/**
 * Scores one offer for the player's career priority, 0 to 1. Pure and deterministic:
 * max_money rewards salary, ring_chasing rewards a strong team and a starting role,
 * market_size rewards a big market.
 */
export function scoreOfferForPlayer(offer: PlayerOffer, priority: CareerPriority): number {
  const salaryScore = Math.min(1, offer.salary / LEAGUE_CONFIG.salary.maximum);
  const teamScore = Math.min(1, Math.max(0, offer.teamOverall / 100));
  const roleScore = offer.projectedRole === 'franchise' ? 1 : offer.projectedRole === 'starter' ? 0.75 : offer.projectedRole === 'sixth_man' ? 0.4 : 0.1;
  const marketScore = Math.min(1, Math.max(0, offer.marketSize / 100));
  switch (priority) {
    case 'max_money':
      return salaryScore;
    case 'ring_chasing':
      return 0.6 * teamScore + 0.4 * roleScore;
    case 'market_size':
      return 0.7 * marketScore + 0.3 * salaryScore;
  }
}

/**
 * Resolves a player's chosen offer. A selected offer that matches a current team offer
 * signs: the player moves to that team and their contract is set. If the player declines
 * (no selection), they stay unsigned and unsignedOffseasons increments.
 */
export function resolvePlayerSigning(
  state: CareerState,
  playerId: PlayerId,
  selectedOffer: PlayerOffer | null,
): CareerState {
  const careers = state.careers;
  if (selectedOffer === null) {
    const next = careers.map((c) =>
      c.playerId === playerId ? { ...c, unsignedOffseasons: c.unsignedOffseasons + 1 } : c,
    );
    return { ...state, careers: next };
  }
  // Cap space is checked only when team metadata is present, as offers are.
  if (!offerFitsCap(state, selectedOffer)) return state;
  const rosters: CareerState['rosters'] = { ...state.rosters };
  for (const teamId of Object.keys(rosters) as TeamId[]) {
    rosters[teamId] = (rosters[teamId] ?? []).filter((id) => id !== playerId);
  }
  rosters[selectedOffer.teamId] = [...(rosters[selectedOffer.teamId] ?? []), playerId];
  const players = state.players.map((p) =>
    p.id === playerId
      ? { ...p, teamId: selectedOffer.teamId, contract: { salary: selectedOffer.salary, yearsLeft: selectedOffer.years, type: 'standard' as const } }
      : p,
  );
  const signedCareers = careers.map((c) => (c.playerId === playerId ? { ...c, unsignedOffseasons: 0 } : c));
  return { ...state, rosters, players, careers: signedCareers };
}

/**
 * Finds valid AI trade partners for a player who has requested a trade. Returns
 * an empty list unless shouldRequestTrade is true. A partner qualifies when the
 * two-team trade passes checkTrade (salary matching and roster limits). Preferred
 * teams are tried first, then the rest by team id. Pure: reads state only.
 */
export function findTradeDestination(
  state: CareerState,
  playerId: PlayerId,
  preferredTeamIds: TeamId[] = [],
): TeamId[] {
  const career = state.careers.find((c) => c.playerId === playerId);
  if (!career || !shouldRequestTrade(career.unsignedOffseasons)) return [];
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];
  const userRoster = (state.rosters[state.userTeamId] ?? [])
    .map((id) => state.players.find((p) => p.id === id))
    .filter((p): p is Player => p !== undefined);
  const others = (Object.keys(state.rosters) as TeamId[]).filter((t) => t !== state.userTeamId);
  const ordered = [
    ...preferredTeamIds.filter((t) => others.includes(t)),
    ...others.filter((t) => !preferredTeamIds.includes(t)).sort(),
  ];
  const partners: TeamId[] = [];
  for (const teamId of ordered) {
    const theirRoster = (state.rosters[teamId] ?? [])
      .map((id) => state.players.find((p) => p.id === id))
      .filter((p): p is Player => p !== undefined);
    // A partner qualifies if some player on their roster can be swapped for the requester.
    const valid = theirRoster.some(
      (give) =>
        checkTrade({
          sendA: [player],
          sendB: [give],
          rosterA: userRoster.length,
          rosterB: theirRoster.length,
        }).ok,
    );
    if (valid) partners.push(teamId);
  }
  return partners;
}
