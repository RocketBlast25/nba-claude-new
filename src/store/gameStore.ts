/**
 * Zustand 5 adapter over the pure sim (ADR-001). Holds serializable career state
 * and wraps pure functions from `src/sim/` and `src/possession/`. No game rules
 * live here; the UI reads this store and never imports sim logic directly.
 */
import { create } from 'zustand';
import type { CareerState, KeyMoment, KeyMomentResult } from '../sim/career/types';
import { resolveMoment, selectMoments } from '../sim/career/keyMoments';
import type { Player } from '../sim/core/models';
import { checkRotation } from '../sim/league/rotation';
import { checkTrade } from '../sim/league/trade';
import { evaluateOffer } from '../sim/league/freeAgentOffer';
import type { ActionId } from '../possession/decision';
import { advanceCareerOffseason, runOffseasonEconomyWithOrder } from '../sim/career/careerLoop';
import { simulateSeason, type GameBoxScoreRecord, type SeasonResult } from '../sim/league/season';
import { runPlayoffs, type PlayoffResult } from '../sim/league/playoffs';
import type { DraftPick } from '../sim/league/draft';
import {
  advanceSeason,
  resumeSeason,
  startSeason,
  type AdvanceResult,
  type ResumableSeasonState,
  type UserDecision,
} from '../sim/season/resumableSeason';
import { SeededRng } from '../sim/core/random';
import { makeId, type GameId, type TeamId } from '../sim/core/types';
import { simulateGame, type SimTeam } from '../sim/background/gameSim';
import type { ScheduleTeam } from '../sim/league/schedule';
import { buildSave, parseSave, serializeSave, type CareerPayload } from '../persistence/snapshot';
import { readSlot, writeSlot, type SlotId, type SlotStorage, type SlotWriteResult } from '../persistence/slots';

export type CareerPhase = 'regular_season' | 'playoffs' | 'draft' | 'offseason';

export interface GameStoreState {
  /** Serializable career snapshot. Null until a career is started. */
  career: CareerState | null;
  phase: CareerPhase;
  /** Team the user controls. */
  userTeamId: TeamId | null;
  /** Latest regular-season result (standings, outcomes, player lines). */
  season: SeasonResult | null;
  /** Latest playoff result, used by the bracket and the draft order. */
  playoffs: PlayoffResult | null;
  /** Undecided user Key Moments awaiting a card choice, in order. */
  pendingMoments: KeyMoment[];
  /** Resolved Key Moment results from this session, for the feed. */
  resolvedMoments: KeyMomentResult[];
  /** Random seed the career uses; kept so runs are reproducible. */
  seed: number;
  /** League teams (schedule metadata plus sim ratings) the season runs against. */
  leagueTeams: (ScheduleTeam & { sim: SimTeam })[] | null;
  /** The 30-pick draft order for the latest offseason. */
  draftOrder: DraftPick[];
  /** In-progress resumable regular season. Null when no run is active. */
  seasonRun: ResumableSeasonState | null;
}

export interface GameStoreActions {
  /** Starts a fresh career with the given league. */
  startCareer: (args: {
    career: CareerState;
    userTeamId: TeamId;
    seed: number;
    leagueTeams: (ScheduleTeam & { sim: SimTeam })[];
  }) => void;
  /** Runs the regular season, playoffs and draft-ready state for the current season. */
  playSeason: (teams: (ScheduleTeam & { sim: SimTeam })[]) => void;
  /** Starts a resumable regular season that pauses on user Key Moments. */
  startSeasonRun: (teams: (ScheduleTeam & { sim: SimTeam })[]) => AdvanceResult;
  /** Plays games until the next Key Moment or the end of the regular season. */
  advanceSeasonRun: () => AdvanceResult | null;
  /** Applies the user's decision to the pending Key Moment and continues the season. */
  resolveSeasonMoment: (decision: UserDecision) => AdvanceResult | null;
  /** Queues Key Moments drawn for the user's next game. */
  queueMoments: (moments: KeyMoment[]) => void;
  /** Resolves the front pending Key Moment with the user's chosen action. */
  resolveNextMoment: (actionId: ActionId) => KeyMomentResult | null;
  /** Runs the offseason: retirements, contracts, draft, free agency and roster top-up. */
  runOffseason: () => void;
  /** Sets the user team's rotation after validating it against the roster. */
  setUserRotation: (playerIds: Player['id'][]) => { ok: true } | { ok: false; reason: string };
  /** Trades players between the user team and another team after the salary-matching check. */
  tradeWithTeam: (args: {
    otherTeamId: TeamId;
    sendUser: Player['id'][];
    sendOther: Player['id'][];
  }) => { ok: true } | { ok: false; reason: string };
  /** Offers a free agent a contract for the user team. Signs on success. */
  offerFreeAgent: (playerId: Player['id']) => { ok: true } | { ok: false; reason: string };
  /** Moves the phase forward (for example, from draft to offseason). */
  setPhase: (phase: CareerPhase) => void;
  /** Clears the store back to its empty state. */
  reset: () => void;
  /** Saves the current career to a manual slot or autosave. */
  saveToSlot: (slot: SlotId) => SlotWriteResult;
  /** Loads a slot into the store. Returns false when the slot is empty or invalid. */
  loadFromSlot: (slot: SlotId) => boolean;
  /** Serializes the current career to a JSON string for export. */
  exportSave: () => string | null;
  /** Imports a JSON save. Invalid input leaves the store unchanged. */
  importSave: (text: string) => { ok: true } | { ok: false; error: string };
}

export type GameStore = GameStoreState & GameStoreActions;

const initialState: GameStoreState = {
  career: null,
  phase: 'regular_season',
  userTeamId: null,
  season: null,
  playoffs: null,
  pendingMoments: [],
  resolvedMoments: [],
  seed: 1,
  leagueTeams: null,
  draftOrder: [],
  seasonRun: null,
};

export const useGameStore = create<GameStore>()((set, get) => ({
  ...initialState,

  startCareer: ({ career, userTeamId, seed, leagueTeams }) =>
    set({
      ...initialState,
      career,
      userTeamId,
      seed,
      leagueTeams,
      phase: 'regular_season',
    }),

  playSeason: (teams) => {
    const { career, seed } = get();
    if (!career) throw new Error('playSeason: no career started');
    const rng = new SeededRng(seed + career.season);
    const season = simulateSeason(teams, rng.fork());
    const simById = new Map(teams.map((t) => [t.id, t.sim]));
    const playoffs = runPlayoffs(
      season.standings,
      (home, away, gameRng) => {
        const h = simById.get(home);
        const a = simById.get(away);
        if (!h || !a) throw new Error('playSeason: unknown playoff team');
        const result = simulateGame(makeId<'game'>(`po-${home}-${away}`) as GameId, h, a, gameRng);
        return result.home.points > result.away.points;
      },
      rng.fork(),
    );
    const userGames = season.gameBoxScores.filter((g) => userPlaysIn(career, g));
    const moments = sampleThirds(userGames).flatMap((g, i) =>
      drawUserMoments(career, g.gameId, seed + career.season + 7 + i).slice(0, 1),
    );
    set({ season, playoffs, phase: 'playoffs', pendingMoments: [...get().pendingMoments, ...moments] });
  },

  startSeasonRun: (teams) => {
    const { career, seed, userTeamId } = get();
    if (!career) throw new Error('startSeasonRun: no career started');
    if (!userTeamId) throw new Error('startSeasonRun: no user team');
    const run = startSeason(career.season, userTeamId, teams, seed + career.season);
    const sim = new Map(teams.map((t) => [t.id, t.sim]));
    const result = advanceSeason(run, sim, teams);
    set({ seasonRun: result.state });
    return result;
  },

  advanceSeasonRun: () => {
    const { seasonRun, leagueTeams } = get();
    if (!seasonRun || !leagueTeams) return null;
    const sim = new Map(leagueTeams.map((t) => [t.id, t.sim]));
    const result = advanceSeason(seasonRun, sim, leagueTeams);
    set({ seasonRun: result.state });
    return result;
  },

  resolveSeasonMoment: (decision) => {
    const { seasonRun, leagueTeams } = get();
    if (!seasonRun || !leagueTeams) return null;
    const sim = new Map(leagueTeams.map((t) => [t.id, t.sim]));
    const result = resumeSeason(seasonRun, decision, sim, leagueTeams);
    set({ seasonRun: result.state });
    return result;
  },

  queueMoments: (moments) =>
    set((s) => ({ pendingMoments: [...s.pendingMoments, ...moments] })),

  resolveNextMoment: (actionId) => {
    const { pendingMoments, seed, career } = get();
    const [next, ...rest] = pendingMoments;
    if (!next) return null;
    const rng = new SeededRng(seed + (career?.season ?? 0) + rest.length);
    const result = resolveMoment(next, rng, () => actionId);
    set((s) => ({
      pendingMoments: rest,
      resolvedMoments: [...s.resolvedMoments, result],
    }));
    return result;
  },

  setUserRotation: (playerIds) => {
    const { career } = get();
    if (!career) return { ok: false, reason: 'No career started' };
    const roster = career.rosters[career.userTeamId] ?? [];
    const check = checkRotation(playerIds, roster);
    if (!check.ok) return check;
    set({ career: { ...career, rotations: { ...(career.rotations ?? {}), [career.userTeamId]: playerIds } } });
    return { ok: true };
  },

  tradeWithTeam: ({ otherTeamId, sendUser, sendOther }) => {
    const { career } = get();
    if (!career) return { ok: false, reason: 'No career started' };
    const userId = career.userTeamId;
    const userRoster = career.rosters[userId] ?? [];
    const otherRoster = career.rosters[otherTeamId] ?? [];
    const byId = new Map(career.players.map((p) => [p.id, p]));
    const pick = (ids: Player['id'][], roster: Player['id'][]): Player[] | null => {
      if (ids.some((id) => !roster.includes(id))) return null;
      const found = ids.map((id) => byId.get(id)).filter((p): p is Player => p !== undefined);
      return found.length === ids.length ? found : null;
    };
    const outUser = pick(sendUser, userRoster);
    const outOther = pick(sendOther, otherRoster);
    if (!outUser || !outOther) return { ok: false, reason: 'Trade includes players not on the roster' };
    const check = checkTrade({
      sendA: outUser,
      sendB: outOther,
      rosterA: userRoster.length,
      rosterB: otherRoster.length,
    });
    if (!check.ok) return check;
    const swapIds = (roster: Player['id'][], out: Player['id'][], inc: Player['id'][]) => [
      ...roster.filter((id) => !out.includes(id)),
      ...inc,
    ];
    const rosters = {
      ...career.rosters,
      [userId]: swapIds(userRoster, sendUser, sendOther),
      [otherTeamId]: swapIds(otherRoster, sendOther, sendUser),
    };
    set({ career: { ...career, rosters } });
    return { ok: true };
  },

  offerFreeAgent: (playerId) => {
    const { career } = get();
    if (!career) return { ok: false, reason: 'No career started' };
    const player = career.players.find((p) => p.id === playerId);
    if (!player) return { ok: false, reason: 'Unknown player' };
    const userId = career.userTeamId;
    const roster = (career.rosters[userId] ?? [])
      .map((id) => career.players.find((p) => p.id === id))
      .filter((p): p is Player => p !== undefined);
    const offer = evaluateOffer({ player, roster });
    if (!offer.ok) return offer;
    const signed: Player = { ...player, contract: offer.contract };
    set({
      career: {
        ...career,
        players: career.players.map((p) => (p.id === playerId ? signed : p)),
        rosters: { ...career.rosters, [userId]: [...(career.rosters[userId] ?? []), playerId] },
      },
    });
    return { ok: true };
  },

  runOffseason: () => {
    const { career, season, playoffs, seed } = get();
    if (!career || !season || !playoffs) {
      throw new Error('runOffseason: season and playoffs must be played first');
    }
    const rng = new SeededRng(seed + career.season + 1000);
    const step = advanceCareerOffseason(career, rng.fork());
    const playoffTeams = playoffs.exitOrder;
    // One call: the board and the drafted rookies come from the same draft order.
    const { state: next, draftOrder } = runOffseasonEconomyWithOrder(
      step.state,
      season.standings,
      playoffTeams,
      playoffs.exitOrder,
      rng.fork(),
    );
    set({
      career: { ...next, season: career.season + 1 },
      draftOrder,
      phase: 'offseason',
    });
  },

  setPhase: (phase) => set({ phase }),

  reset: () => set({ ...initialState }),

  saveToSlot: (slot) => {
    const save = buildSave(payloadOf(get()));
    return writeSlot(localSlotStorage(), slot, save);
  },

  loadFromSlot: (slot) => {
    const save = readSlot(localSlotStorage(), slot);
    if (!save) return false;
    applyPayload(set, save.payload);
    return true;
  },

  exportSave: () => {
    const { career } = get();
    if (!career) return null;
    return serializeSave(buildSave(payloadOf(get())));
  },

  importSave: (text) => {
    const parsed = parseSave(text);
    if (!parsed.ok) return parsed;
    applyPayload(set, parsed.save.payload);
    return { ok: true };
  },
}));

/**
 * Autosave: every phase transition writes the autosave slot. Subscribing to the store
 * covers playSeason, runOffseason and setPhase without touching each action.
 */
useGameStore.subscribe((state, prev) => {
  if (state.phase === prev.phase || !state.career) return;
  writeSlot(localSlotStorage(), 'autosave', buildSave(payloadOf(state)));
});

function payloadOf(s: GameStoreState): CareerPayload {
  return {
    career: s.career,
    phase: s.phase,
    userTeamId: s.userTeamId,
    seed: s.seed,
    season: s.season,
    playoffs: s.playoffs,
    draftOrder: s.draftOrder,
    leagueTeams: s.leagueTeams,
    pendingMoments: s.pendingMoments,
    resolvedMoments: s.resolvedMoments,
  };
}

function applyPayload(
  set: (partial: Partial<GameStoreState>) => void,
  p: CareerPayload,
): void {
  set({ ...initialState, ...p });
}

/** Browser localStorage when present; an in-memory fallback keeps Node tests working. */
function localSlotStorage(): SlotStorage {
  if (typeof localStorage !== 'undefined') return localStorage;
  const mem = new Map<string, string>();
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  };
}

/** Draws the user's Key Moments for one game and queues them. Pure helper. */
/** Returns one game's per-player box-score lines from the season result, or undefined. */
export function selectBoxScore(
  season: SeasonResult | null,
  gameId: string,
): GameBoxScoreRecord | undefined {
  return season?.gameBoxScores.find((g) => g.gameId === gameId);
}

/**
 * Picks one game from the early, mid and late part of the list (in order), so the
 * user's Key Moments span the season. Returns fewer games when the list is short.
 */
function sampleThirds<T>(items: T[]): T[] {
  if (items.length === 0) return [];
  const picks = [items[0], items[Math.floor(items.length / 2)], items[items.length - 1]];
  return [...new Set(picks)].filter((x): x is T => x !== undefined);
}

/** True when the user's team takes part in this game's box score. */
function userPlaysIn(career: CareerState, game: GameBoxScoreRecord): boolean {
  const roster = new Set(career.rosters[career.userTeamId] ?? []);
  return game.lines.some((line) => roster.has(line.playerId));
}

export function drawUserMoments(career: CareerState, gameId: string, rngSeed: number): KeyMoment[] {
  const actors = career.players.filter((p) => career.rosters[career.userTeamId]?.includes(p.id));
  return selectMoments(gameId, career.season, true, actors, new SeededRng(rngSeed));
}
