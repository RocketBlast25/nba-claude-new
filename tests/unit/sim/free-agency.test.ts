import { describe, expect, it } from 'vitest';
import type { Player } from '../../../src/sim/core/models';
import { makeId, type PlayerId, type TeamId } from '../../../src/sim/core/types';
import {
  findTradeDestination,
  freeAgentPriority,
  generatePlayerOffers,
  negotiateOffer,
  playerAsk,
  rankFreeAgents,
  resolvePlayerSigning,
  rosterNeed,
  scoreOfferForPlayer,
  type PlayerOffer,
} from '../../../src/sim/career/freeAgency';
import { SeededRng } from '../../../src/sim/core/random';
import type { CareerState } from '../../../src/sim/career/types';
import { salaryForOverall } from '../../../src/sim/league/economy';

/** Partial player fixture: only the fields the free-agency functions read. */
const player = (id: string, overall: number): Player =>
  ({
    id: makeId<'player'>(id) as PlayerId,
    overall,
    contract: { salary: 1, yearsLeft: 1, type: 'standard' },
  }) as unknown as Player;

describe('contract negotiation', () => {
  it('accepts an offer at the player ask', () => {
    const p = player('a', 70);
    const ask = playerAsk(70, 50);
    const result = negotiateOffer(p, 50, ask, 3);
    expect(result).toEqual({ kind: 'accepted', contract: { salary: ask, yearsLeft: 3, type: 'standard' } });
  });

  it('counters a near offer and rejects a low one', () => {
    const p = player('a', 70);
    const ask = playerAsk(70, 50);
    const near = negotiateOffer(p, 50, Math.round(ask * 0.95), 3);
    expect(near.kind).toBe('counter');
    if (near.kind === 'counter') expect(near.ask).toBeGreaterThan(Math.round(ask * 0.95));
    expect(negotiateOffer(p, 50, Math.round(ask * 0.5), 3).kind).toBe('rejected');
  });

  it('asks less from a happier player', () => {
    expect(playerAsk(70, 90)).toBeLessThan(playerAsk(70, 10));
  });
});

describe('free agency priority', () => {
  it('scores a need-filling player above an equal one on a deep roster', () => {
    const deep = Array.from({ length: 10 }, () => 80);
    const thin = [90, 85, 80, 60, 55, 50, 48, 45, 40, 38];
    const p = player('a', 75);
    expect(freeAgentPriority(p, thin, 1e9)).toBeGreaterThan(freeAgentPriority(p, deep, 1e9));
  });

  it('rosterNeed is 0 for a player at or below the 8th rotation slot', () => {
    const roster = [90, 85, 80, 78, 76, 74, 72, 70, 60, 50];
    expect(rosterNeed(70, roster)).toBe(0);
  });

  it('excludes free agents below the mood threshold and ranks the rest by priority', () => {
    const roster = [90, 85, 80, 78, 76, 74, 72, 70, 60, 50];
    const ranked = rankFreeAgents(
      [
        { player: player('low', 80), mood: 10 },
        { player: player('weak', 60), mood: 80 },
        { player: player('strong', 80), mood: 80 },
      ],
      roster,
      1e9,
    );
    expect(ranked.map((r) => r.player.id)).toEqual(['strong', 'weak'].map((s) => makeId<'player'>(s)));
  });

});

/** Builds a state with a user team (T0) and AI teams, each roster salary-matched to its player. */
function makeState(opts: { aiTeams: number; rosterSalary?: number; userSalary?: number }): CareerState {
  const userTeamId = makeId<'team'>('T0') as TeamId;
  const players: Player[] = [];
  const rosters: Record<TeamId, PlayerId[]> = {} as Record<TeamId, PlayerId[]>;
  const careers: CareerState['careers'] = [];
  const addRoster = (teamId: TeamId, n: number, salary: number, overall: number) => {
    rosters[teamId] = [];
    for (let i = 0; i < n; i++) {
      const id = makeId<'player'>(`${teamId}-${i}`) as PlayerId;
      players.push({ ...player(`${teamId}-${i}`, overall), id, contract: { salary, yearsLeft: 2, type: 'standard' } });
      rosters[teamId]!.push(id);
      careers.push({ playerId: id, yearsPro: 3, mood: 60, chemistry: 50, unsignedOffseasons: 0, retired: false, retiredSeason: null });
    }
  };
  addRoster(userTeamId, 10, opts.userSalary ?? 5000, 70);
  for (let t = 1; t <= opts.aiTeams; t++) {
    addRoster(makeId<'team'>(`T${t}`) as TeamId, 10, opts.rosterSalary ?? 5000, 60 + (t % 10));
  }
  return { season: 1, userTeamId, players, rosters, careers, events: [] };
}

const offer = (over: Partial<PlayerOffer> = {}): PlayerOffer => ({
  teamId: makeId<'team'>('T1') as TeamId,
  salary: 10000,
  years: 2,
  teamOverall: 60,
  marketSize: 50,
  projectedRole: 'sixth_man',
  ...over,
});

describe('generatePlayerOffers', () => {
  it('offers only from AI teams with cap space and roster room, excluding the user team', () => {
    const state = makeState({ aiTeams: 4, rosterSalary: 5000 });
    const star = { ...player('star', 80), id: makeId<'player'>('star') as PlayerId };
    const offers = generatePlayerOffers(state, star, new SeededRng(1));
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((o) => o.teamId !== state.userTeamId)).toBe(true);
  });

  it('is deterministic for the same seed and state', () => {
    const state = makeState({ aiTeams: 4 });
    const star = { ...player('star', 75), id: makeId<'player'>('star') as PlayerId };
    const a = generatePlayerOffers(state, star, new SeededRng(7));
    const b = generatePlayerOffers(state, star, new SeededRng(7));
    expect(a).toEqual(b);
  });

  it('skips teams without enough cap space for the offer', () => {
    // Each AI payroll of 139,000 leaves 1,000 of cap space, below any market salary.
    const state = makeState({ aiTeams: 3, rosterSalary: 13900 });
    const star = { ...player('star', 80), id: makeId<'player'>('star') as PlayerId };
    expect(generatePlayerOffers(state, star, new SeededRng(1))).toEqual([]);
  });

  it('sets offer salary around the market salary for the player', () => {
    const state = makeState({ aiTeams: 3 });
    const star = { ...player('star', 75), id: makeId<'player'>('star') as PlayerId };
    const base = salaryForOverall(75);
    for (const o of generatePlayerOffers(state, star, new SeededRng(3))) {
      expect(o.salary).toBeGreaterThan(base * 0.8);
      expect(o.salary).toBeLessThan(base * 1.3);
    }
  });
});

describe('scoreOfferForPlayer', () => {
  it('max_money prefers the larger salary', () => {
    const low = offer({ salary: 5000 });
    const high = offer({ salary: 30000 });
    expect(scoreOfferForPlayer(high, 'max_money')).toBeGreaterThan(scoreOfferForPlayer(low, 'max_money'));
  });

  it('ring_chasing prefers the stronger team and starting role', () => {
    const weak = offer({ teamOverall: 45, projectedRole: 'bench' });
    const strong = offer({ teamOverall: 75, projectedRole: 'franchise' });
    expect(scoreOfferForPlayer(strong, 'ring_chasing')).toBeGreaterThan(scoreOfferForPlayer(weak, 'ring_chasing'));
  });

  it('market_size prefers the bigger market', () => {
    const small = offer({ marketSize: 20 });
    const big = offer({ marketSize: 90 });
    expect(scoreOfferForPlayer(big, 'market_size')).toBeGreaterThan(scoreOfferForPlayer(small, 'market_size'));
  });

  it('returns a value between 0 and 1 for every priority', () => {
    for (const p of ['max_money', 'ring_chasing', 'market_size'] as const) {
      const s = scoreOfferForPlayer(offer(), p);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe('resolvePlayerSigning', () => {
  it('moves the player to the selected team with the offer contract and resets unsignedOffseasons', () => {
    const state = makeState({ aiTeams: 2 });
    const target = state.careers[state.careers.length - 1]!;
    const teamId = makeId<'team'>('T1') as TeamId;
    const next = resolvePlayerSigning(
      { ...state, careers: state.careers.map((c) => (c.playerId === target.playerId ? { ...c, unsignedOffseasons: 2 } : c)) },
      target.playerId,
      offer({ teamId, salary: 9000, years: 3 }),
    );
    expect(next.rosters[teamId]).toContain(target.playerId);
    expect(next.players.find((p) => p.id === target.playerId)).toMatchObject({ teamId, contract: { salary: 9000, yearsLeft: 3 } });
    expect(next.careers.find((c) => c.playerId === target.playerId)!.unsignedOffseasons).toBe(0);
  });

  it('keeps the player unsigned and increments unsignedOffseasons when declined', () => {
    const state = makeState({ aiTeams: 2 });
    const target = state.careers[0]!;
    const next = resolvePlayerSigning(state, target.playerId, null);
    expect(next.careers.find((c) => c.playerId === target.playerId)!.unsignedOffseasons).toBe(1);
    expect(next.rosters[state.userTeamId]).toContain(target.playerId);
  });
});

describe('findTradeDestination', () => {
  it('returns no partners when the player has not requested a trade', () => {
    const state = makeState({ aiTeams: 3 });
    expect(findTradeDestination(state, state.careers[0]!.playerId)).toEqual([]);
  });

  it('returns salary-matching partners once a trade is requested', () => {
    const state = makeState({ aiTeams: 3, rosterSalary: 5000, userSalary: 5000 });
    const requester = state.careers[0]!.playerId;
    const requested = { ...state, careers: state.careers.map((c) => (c.playerId === requester ? { ...c, unsignedOffseasons: 3 } : c)) };
    const partners = findTradeDestination(requested, requester);
    expect(partners.length).toBeGreaterThan(0);
    expect(partners.every((t) => t !== state.userTeamId)).toBe(true);
  });

  it('puts preferred teams first when they are valid', () => {
    const state = makeState({ aiTeams: 4, rosterSalary: 5000, userSalary: 5000 });
    const requester = state.careers[0]!.playerId;
    const requested = { ...state, careers: state.careers.map((c) => (c.playerId === requester ? { ...c, unsignedOffseasons: 3 } : c)) };
    const preferred = makeId<'team'>('T3') as TeamId;
    expect(findTradeDestination(requested, requester, [preferred])[0]).toBe(preferred);
  });
});
