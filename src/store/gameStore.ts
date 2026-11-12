/**
 * Zustand 5 adapter over the pure sim (ADR-001). Holds serializable career state
 * and wraps pure functions from `src/sim/` and `src/possession/`. No game rules
 * live here; the UI reads this store and never imports sim logic directly.
 */
import { create } from 'zustand';
import type { CareerState, KeyMoment, KeyMomentResult } from '../sim/career/types';
import { resolveMoment, selectMoments } from '../sim/career/keyMoments';
import type { ActionId } from '../possession/decision';
import { advanceCareerOffseason, runOffseasonEconomyWithOrder } from '../sim/career/careerLoop';
import { simulateSeason, type SeasonResult } from '../sim/league/season';
import { runPlayoffs, type PlayoffResult } from '../sim/league/playoffs';
import type { DraftPick } from '../sim/league/draft';
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
  /** Queues Key Moments drawn for the user's next game. */
  queueMoments: (moments: KeyMoment[]) => void;
  /** Resolves the front pending Key Moment with the user's chosen action. */
  resolveNextMoment: (actionId: ActionId) => KeyMomentResult | null;
  /** Runs the offseason: retirements, contracts, draft, free agency and roster top-up. */
  runOffseason: () => void;
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
    set({ season, playoffs, phase: 'playoffs' });
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
export function drawUserMoments(career: CareerState, gameId: string, rngSeed: number): KeyMoment[] {
  const actors = career.players.filter((p) => career.rosters[career.userTeamId]?.includes(p.id));
  return selectMoments(gameId, career.season, true, actors, new SeededRng(rngSeed));
}
