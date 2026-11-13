/**
 * Zustand 5 adapter over the pure sim (ADR-001). Holds serializable career state
 * and wraps pure functions from `src/sim/` and `src/possession/`. No game rules
 * live here; the UI reads this store and never imports sim logic directly.
 */
import { create } from 'zustand';
import type { CareerState, KeyMoment, KeyMomentResult, PlayerCareer, PlayerModeState } from '../sim/career/types';
import {
  applyCoachTrustDelta,
  createPlayerCareerMode,
  deriveRole,
  nextUnhappySeasons,
  recordTrophy,
  shouldRequestTrade,
  updateHappiness,
} from '../sim/career/playerMode';
import {
  assignSeasonObjectives,
  evaluateSeasonObjectives,
  totalsFromBoxScores,
} from '../sim/career/keyMomentTriggers';
import {
  findTradeDestination,
  generatePlayerOffers,
  offerFitsCap,
  resolvePlayerSigning,
  type PlayerOffer,
} from '../sim/career/freeAgency';
import { resolveMoment, selectMoments } from '../sim/career/keyMoments';
import { createCustomPlayer, type ArchetypeId } from '../sim/career/customPlayer';
import { createNewCareer, NEW_CAREER_TEAMS, type NewCareerOptions } from '../sim/career/newCareer';
import type { Player, Position } from '../sim/core/models';
import { checkRotation } from '../sim/league/rotation';
import { LEAGUE_CONFIG } from '../sim/league/leagueConfig';
import { checkTrade } from '../sim/league/trade';
import { evaluateOffer } from '../sim/league/freeAgentOffer';
import type { ActionId } from '../possession/decision';
import { advanceCareerOffseason, runOffseasonEconomyWithOrder } from '../sim/career/careerLoop';
import { simulateSeason, type GameBoxScoreRecord, type SeasonResult } from '../sim/league/season';
import { runPlayoffs, type PlayoffResult } from '../sim/league/playoffs';
import type { DraftPick } from '../sim/league/draft';
import {
  advanceSeason,
  advancePlayoffsRun,
  resumePlayoffsRun,
  resumeSeason,
  seasonResultFromRun,
  startPlayoffsRun,
  startSeason,
  type AdvanceResult,
  type PlayoffAdvanceResult,
  type PlayoffsRunState,
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
  /** In-progress resumable playoffs. Null when no playoff run is active. */
  playoffsRun: PlayoffsRunState | null;
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
  /** Starts a resumable playoff run that pauses on user playoff games. */
  startPlayoffsRun: (teams: (ScheduleTeam & { sim: SimTeam })[]) => PlayoffAdvanceResult;
  /** Plays playoff games until the next user game or the Finals. */
  advancePlayoffsRun: () => PlayoffAdvanceResult | null;
  /** Applies the user's decision to the pending playoff moment and continues. */
  resolvePlayoffMoment: (decision: UserDecision) => PlayoffAdvanceResult | null;
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
  /** Generates a fresh 30-team league and starts a new MyCareer from the setup screen. */
  startNewCareer: (options: NewCareerOptions) =>
    | { ok: true; userTeamId: TeamId; playerId: Player['id'] }
    | { ok: false; reason: string };
  /** Adds a user-created player to the user team's roster and returns its id. */
  createPlayer: (args: { name: string; position: Position; archetype: ArchetypeId }) =>
    | { ok: true; playerId: Player['id'] }
    | { ok: false; reason: string };
  /** Starts a career with the given player as the controlled player, with mode state. */
  startPlayerCareer: (playerId: Player['id']) => { ok: true } | { ok: false; reason: string };
  /** Asks for a trade for the controlled player to a valid partner, preferring the given team. */
  requestPlayerTrade: (preferredTeamId?: TeamId) => { ok: true; otherTeamId: TeamId } | { ok: false; reason: string };
  /** Signs the controlled player with one of this offseason's offers. */
  signPlayerOffer: (offer: PlayerOffer) => { ok: true } | { ok: false; reason: string };
  /** Declines every pending offer, leaving the player unsigned for another season. */
  declineAllOffers: () => void;
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
  playoffsRun: null,
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
    const scored = applySeasonObjectives(career, season, userGames);
    const withObjectives = recordChampionship(scored, playoffs, career.season);
    set({
      season,
      playoffs,
      phase: 'playoffs',
      pendingMoments: [...get().pendingMoments, ...moments],
      career: withObjectives,
    });
  },

  startSeasonRun: (teams) => {
    const { career, seed, userTeamId } = get();
    if (!career) throw new Error('startSeasonRun: no career started');
    if (!userTeamId) throw new Error('startSeasonRun: no user team');
    const run = startSeason(career.season, userTeamId, teams, seed + career.season);
    const sim = new Map(teams.map((t) => [t.id, t.sim]));
    const result = advanceSeason(run, sim, teams);
    // A new season starts clean: results from the previous one stay out of the way.
    set({ season: null, playoffs: null, ...seasonRunCommit(get(), result) });
    return result;
  },

  advanceSeasonRun: () => {
    const { seasonRun, leagueTeams } = get();
    if (!seasonRun || !leagueTeams) return null;
    const sim = new Map(leagueTeams.map((t) => [t.id, t.sim]));
    const result = advanceSeason(seasonRun, sim, leagueTeams);
    set(seasonRunCommit(get(), result));
    return result;
  },

  resolveSeasonMoment: (decision) => {
    const { seasonRun, leagueTeams } = get();
    if (!seasonRun || !leagueTeams) return null;
    const sim = new Map(leagueTeams.map((t) => [t.id, t.sim]));
    const result = resumeSeason(seasonRun, decision, sim, leagueTeams);
    set(seasonRunCommit(get(), result));
    return result;
  },

  startPlayoffsRun: (teams) => {
    const { career, seed, userTeamId, seasonRun } = get();
    if (!career) throw new Error('startPlayoffsRun: no career started');
    if (!userTeamId) throw new Error('startPlayoffsRun: no user team');
    const standings = seasonRun?.season === career.season ? seasonRun.standings : null;
    if (!standings) throw new Error('startPlayoffsRun: regular season not finished');
    const run = startPlayoffsRun(career.season, userTeamId, standings, seed + career.season);
    const sim = new Map(teams.map((t) => [t.id, t.sim]));
    const result = advancePlayoffsRun(run, playoffGameRunner(sim));
    set({ playoffs: null, ...playoffsRunCommit(get(), result) });
    return result;
  },

  advancePlayoffsRun: () => {
    const { playoffsRun, leagueTeams } = get();
    if (!playoffsRun || !leagueTeams) return null;
    const sim = new Map(leagueTeams.map((t) => [t.id, t.sim]));
    const result = advancePlayoffsRun(playoffsRun, playoffGameRunner(sim));
    set(playoffsRunCommit(get(), result));
    return result;
  },

  resolvePlayoffMoment: (decision) => {
    const { playoffsRun, leagueTeams } = get();
    if (!playoffsRun || !leagueTeams) return null;
    const sim = new Map(leagueTeams.map((t) => [t.id, t.sim]));
    const result = resumePlayoffsRun(playoffsRun, decision, playoffGameRunner(sim));
    set(playoffsRunCommit(get(), result));
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
    const withOffers = withPlayerOffers(withNewObjectives(next, career.season + 1), rng.fork());
    // The next season's run starts from scratch; the completed season's results stay
    // visible until then, and startSeasonRun clears them when the new season begins.
    set({
      career: { ...withOffers, season: career.season + 1 },
      draftOrder,
      phase: 'offseason',
      seasonRun: null,
      playoffsRun: null,
    });
  },

  setPhase: (phase) => set({ phase }),

  startNewCareer: (options) => {
    if (options.playerName.trim().length === 0) return { ok: false, reason: 'Enter a player name' };
    if (!Number.isFinite(options.seed)) return { ok: false, reason: 'Seed must be a number' };
    if (options.userTeamId && !NEW_CAREER_TEAMS.some((t) => t.id === options.userTeamId)) {
      return { ok: false, reason: 'Unknown team' };
    }
    const made = createNewCareer(options);
    set({
      ...initialState,
      career: made.career,
      userTeamId: made.userTeamId,
      seed: made.seed,
      leagueTeams: made.leagueTeams,
      phase: 'regular_season',
    });
    // The phase does not change, so the autosave subscriber would not fire for a new career.
    writeSlot(localSlotStorage(), 'autosave', buildSave(payloadOf(get())));
    return { ok: true, userTeamId: made.userTeamId, playerId: made.playerId };
  },

  createPlayer: ({ name, position, archetype }) => {
    const { career } = get();
    if (!career) return { ok: false, reason: 'No career started' };
    if (name.trim().length === 0) return { ok: false, reason: 'Enter a player name' };
    const roster = career.rosters[career.userTeamId] ?? [];
    if (roster.length >= LEAGUE_CONFIG.maxRosterSize) return { ok: false, reason: 'Team roster is full' };
    const playerId = makeId<'player'>(`custom-${career.season}-${career.players.length + 1}`);
    const player = createCustomPlayer({ id: playerId, name, position, archetype });
    const newCareer: PlayerCareer = {
      playerId,
      yearsPro: 0,
      mood: 50,
      chemistry: 50,
      unsignedOffseasons: 0,
      retired: false,
      retiredSeason: null,
    };
    set({
      career: {
        ...career,
        players: [...career.players, player],
        rosters: { ...career.rosters, [career.userTeamId]: [...roster, playerId] },
        careers: [...career.careers, newCareer],
      },
    });
    return { ok: true, playerId };
  },

  startPlayerCareer: (playerId) => {
    const { career } = get();
    if (!career) return { ok: false, reason: 'No career started' };
    const player = career.players.find((p) => p.id === playerId);
    if (!player) return { ok: false, reason: 'Unknown player' };
    const mode = createPlayerCareerMode(player);
    const playerMode: PlayerModeState = {
      ...mode,
      lifetimeEarnings: 0,
      activeObjectives: [],
      pendingOffers: [],
      unhappySeasons: 0,
    };
    const started = withNewObjectives({ ...career, playerMode }, career.season);
    set({ career: started });
    return { ok: true };
  },

  requestPlayerTrade: (preferredTeamId) => {
    const { career } = get();
    if (!career || !career.playerMode) return { ok: false, reason: 'No player career started' };
    if (!shouldRequestTrade(career.playerMode.unhappySeasons)) {
      return { ok: false, reason: 'Trade is not requested yet' };
    }
    const playerId = career.playerMode.playerId;
    const partners = findTradeDestination(career, playerId, preferredTeamId ? [preferredTeamId] : []);
    const otherTeamId = partners[0];
    if (!otherTeamId) return { ok: false, reason: 'No team can take this trade' };
    const player = career.players.find((x) => x.id === playerId);
    if (!player) return { ok: false, reason: 'Unknown player' };
    const otherRoster = career.rosters[otherTeamId] ?? [];
    const give = otherRoster.find((id) => {
      const p = career.players.find((x) => x.id === id);
      return p !== undefined && checkTrade({
        sendA: [player],
        sendB: [p],
        rosterA: (career.rosters[career.userTeamId] ?? []).length,
        rosterB: otherRoster.length,
      }).ok;
    });
    if (!give) return { ok: false, reason: 'No team can take this trade' };
    const traded = get().tradeWithTeam({ otherTeamId, sendUser: [playerId], sendOther: [give] });
    if (!traded.ok) return traded;
    const current = get().career;
    if (current?.playerMode) {
      set({ career: { ...current, playerMode: { ...current.playerMode, unhappySeasons: 0 } } });
    }
    return { ok: true, otherTeamId };
  },

  signPlayerOffer: (offer) => {
    const { career } = get();
    if (!career || !career.playerMode) return { ok: false, reason: 'No player career started' };
    const playerId = career.playerMode.playerId;
    const pending = career.playerMode.pendingOffers;
    if (!pending.some((o) => o.teamId === offer.teamId && o.salary === offer.salary)) {
      return { ok: false, reason: 'Offer is not pending' };
    }
    if ((career.rosters[offer.teamId] ?? []).length >= LEAGUE_CONFIG.maxRosterSize) {
      return { ok: false, reason: 'Team roster is full' };
    }
    if (!offerFitsCap(career, offer)) {
      return { ok: false, reason: 'Team is over the cap for this offer' };
    }
    const next = resolvePlayerSigning(career, playerId, offer);
    // Once the offseason's offers are settled, the next season can start.
    const phase = get().phase === 'offseason' ? 'regular_season' : get().phase;
    set({
      career: {
        ...next,
        playerMode: { ...career.playerMode, pendingOffers: [] },
      },
      phase,
    });
    return { ok: true };
  },

  declineAllOffers: () => {
    const { career } = get();
    if (!career || !career.playerMode) return;
    const declined = resolvePlayerSigning(career, career.playerMode.playerId, null);
    const phase = get().phase === 'offseason' ? 'regular_season' : get().phase;
    set({
      career: {
        ...declined,
        playerMode: { ...career.playerMode, pendingOffers: [] },
      },
      phase,
    });
  },

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

/** Plays one playoff game with the series RNG, mirroring the runPlayoffs game in playSeason. */
function playoffGameRunner(sim: Map<TeamId, SimTeam>) {
  return (home: TeamId, away: TeamId, gameRng: SeededRng): boolean => {
    const h = sim.get(home);
    const a = sim.get(away);
    if (!h || !a) throw new Error('playoffs: unknown playoff team');
    const result = simulateGame(makeId<'game'>(`po-${home}-${away}`) as GameId, h, a, gameRng);
    return result.home.points > result.away.points;
  };
}

/**
 * Applies a season run's result. A finished run commits the season (standings, outcomes,
 * box scores, player averages), scores the controlled player's objectives against it, and
 * enables the playoffs.
 */
function seasonRunCommit(state: GameStoreState, result: AdvanceResult): Partial<GameStoreState> {
  if (result.status !== 'finished') return { seasonRun: result.state };
  const { career, leagueTeams } = state;
  if (!career || !leagueTeams) return { seasonRun: result.state };
  const season = seasonResultFromRun(result.state, leagueTeams);
  const userGames = season.gameBoxScores.filter((g) => userPlaysIn(career, g));
  return {
    seasonRun: result.state,
    season,
    career: applySeasonObjectives(career, season, userGames),
    phase: 'playoffs',
  };
}

/**
 * Applies a playoff run's result. A finished run commits the bracket (champion,
 * runner-up, rounds) and records the controlled player's championship trophy when
 * their team won it.
 */
function playoffsRunCommit(
  state: GameStoreState,
  result: PlayoffAdvanceResult,
): Partial<GameStoreState> {
  const playoffs = result.status === 'finished' ? result.result : result.state.result;
  return {
    playoffsRun: result.state,
    playoffs: playoffs ?? state.playoffs,
    career:
      playoffs && state.career
        ? recordChampionship(state.career, playoffs, state.career.season)
        : state.career,
  };
}

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
    seasonRun: s.seasonRun,
    playoffsRun: s.playoffsRun,
  };
}

function applyPayload(
  set: (partial: Partial<GameStoreState>) => void,
  p: CareerPayload,
): void {
  set({ ...initialState, ...p });
}

/** Browser localStorage when present; an in-memory fallback keeps Node tests working. */
// Shared across calls so a save written in one call can be read back in a later one
// when no browser localStorage exists (Node tests).
const memorySlots = new Map<string, string>();

function localSlotStorage(): SlotStorage {
  if (typeof localStorage !== 'undefined') return localStorage;
  const mem = memorySlots;
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

/**
 * Scores the controlled player's season against their objectives and applies coach
 * trust, unhappiness and the trade streak. A career without player mode is unchanged.
 */
function applySeasonObjectives(
  career: CareerState,
  season: SeasonResult,
  userGames: GameBoxScoreRecord[],
): CareerState {
  const mode = career.playerMode;
  if (!mode) return career;
  const lines = userGames.flatMap((g) => g.lines.filter((l) => l.playerId === mode.playerId));
  const userStanding = season.standings.find((r) => r.teamId === career.userTeamId);
  const wins = userStanding?.wins ?? 0;
  const losses = userStanding?.losses ?? 0;
  const totals = totalsFromBoxScores(lines, wins, losses);
  const evaluation = evaluateSeasonObjectives(totals, mode.activeObjectives);
  const trusted = applyCoachTrustDelta(mode, evaluation.coachTrustDelta);
  const role = playerRoleOn(career, mode.playerId);
  const teamWinPct = wins + losses === 0 ? 0.5 : wins / (wins + losses);
  const happy = updateHappiness(trusted, { role, teamWinPct });
  return {
    ...career,
    playerMode: {
      ...mode,
      ...happy,
      unhappySeasons: nextUnhappySeasons(mode.unhappySeasons, happy.happiness),
      activeObjectives: [],
    },
  };
}

/** Assigns the controlled player's objectives for a new season. */
function withNewObjectives(career: CareerState, season: number): CareerState {
  const mode = career.playerMode;
  if (!mode) return career;
  const player = career.players.find((p) => p.id === mode.playerId);
  if (!player) return career;
  const role = playerRoleOn(career, mode.playerId);
  const objectives = assignSeasonObjectives(player.overall, role, new SeededRng(season));
  return { ...career, playerMode: { ...mode, activeObjectives: objectives } };
}

/**
 * Replaces the controlled player's pending offers when their contract has expired.
 * A career without player mode, or a player still under contract, is unchanged.
 */
function withPlayerOffers(career: CareerState, rng: SeededRng): CareerState {
  const mode = career.playerMode;
  if (!mode) return career;
  const player = career.players.find((p) => p.id === mode.playerId);
  if (!player || player.contract.yearsLeft > 0) return career;
  const offers = generatePlayerOffers(career, player, rng);
  return { ...career, playerMode: { ...mode, pendingOffers: offers } };
}

/** Records a championship trophy for the controlled player when the user's team wins. */
function recordChampionship(career: CareerState, playoffs: PlayoffResult, season: number): CareerState {
  const mode = career.playerMode;
  if (!mode || playoffs.champion !== career.userTeamId) return career;
  return {
    ...career,
    playerMode: { ...mode, ...recordTrophy(mode, { kind: 'championship', season, teamId: career.userTeamId }) },
  };
}

/** Role from the player's overall rank on the user's roster. */
function playerRoleOn(career: CareerState, playerId: Player['id']): ReturnType<typeof deriveRole> {
  const roster = (career.rosters[career.userTeamId] ?? [])
    .map((id) => career.players.find((p) => p.id === id))
    .filter((p): p is Player => p !== undefined)
    .sort((a, b) => b.overall - a.overall);
  const index = roster.findIndex((p) => p.id === playerId);
  const player = roster[index];
  if (!player) return 'bench';
  return deriveRole({ rosterRank: index + 1, overall: player.overall, isStarter: index < 5 });
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
