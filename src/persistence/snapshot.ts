/**
 * Pure save-format logic for career persistence (Milestone 7, Phase A).
 * No browser APIs here: storage access lives in `slots.ts`, and this module only
 * builds, serializes and validates plain JSON-safe snapshots.
 */
import type { CareerState } from '../sim/career/types';
import { emptyCareerStats, type CareerStats } from '../sim/career/playerMode';
import type { AwardRecapEntry, RecapAwardKind } from '../sim/career/awardsRecap';
import type { KeyMoment, KeyMomentResult } from '../sim/career/types';
import type { DraftPick } from '../sim/league/draft';
import type { PlayoffResult } from '../sim/league/playoffs';
import type { SeasonResult } from '../sim/league/season';
import type { ScheduleTeam } from '../sim/league/schedule';
import type { SimTeam } from '../sim/background/gameSim';
import type { PlayoffsRunState, ResumableSeasonState } from '../sim/season/resumableSeason';

export const SAVE_VERSION = 1;

export type SavePhase = 'regular_season' | 'playoffs' | 'draft' | 'offseason';
const PHASES: readonly SavePhase[] = ['regular_season', 'playoffs', 'draft', 'offseason'];

/** Everything the store needs to restore a career. Plain data only. */
export interface CareerPayload {
  career: CareerState | null;
  phase: SavePhase;
  userTeamId: CareerState['userTeamId'] | null;
  seed: number;
  season: SeasonResult | null;
  playoffs: PlayoffResult | null;
  draftOrder: DraftPick[];
  leagueTeams: (ScheduleTeam & { sim: SimTeam })[] | null;
  pendingMoments: KeyMoment[];
  resolvedMoments: KeyMomentResult[];
  /** In-progress regular season run. Absent on Phase 1 to 4 saves. */
  seasonRun?: ResumableSeasonState | null;
  /** In-progress playoff run. Absent on saves from before playoff runs existed. */
  playoffsRun?: PlayoffsRunState | null;
  /** Awards recap for the latest finished season or Finals. Absent on older saves. */
  awardsRecap?: AwardsRecapPayload | null;
}

/** The awards recap shown after a season or the Finals, saved so it survives a reload. */
export interface AwardsRecapPayload {
  /** 'regular_season' after the season, 'finals' after the playoffs. */
  stage: 'regular_season' | 'finals';
  season: number;
  entries: AwardRecapEntry[];
  userAwards: RecapAwardKind[];
}

export interface CareerSave {
  version: typeof SAVE_VERSION;
  savedAt: string;
  payload: CareerPayload;
}

export type ParseResult = { ok: true; save: CareerSave } | { ok: false; error: string };

export function buildSave(payload: CareerPayload, savedAt: Date = new Date()): CareerSave {
  return { version: SAVE_VERSION, savedAt: savedAt.toISOString(), payload };
}

export function serializeSave(save: CareerSave): string {
  return JSON.stringify(save);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Upgrades cumulative career stats. Saves written before Milestone 11 have no
 * careerStats, and a partial or malformed record fills in zeros rather than failing to
 * load: the player keeps playing with totals from this point on.
 */
export function normalizeCareerStats(value: unknown): CareerStats {
  const base = emptyCareerStats();
  if (!isRecord(value)) return base;
  const out = { ...base };
  for (const key of Object.keys(base) as (keyof CareerStats)[]) {
    const n = value[key];
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) out[key] = n;
  }
  return out;
}

/**
 * Parses and validates a save. Rejects unknown versions and structurally wrong data
 * so a bad file can never half-apply to the store. Fields added after a save was
 * written are normalized to their defaults, so older saves still load.
 */
export function parseSave(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Save is not valid JSON.' };
  }
  if (!isRecord(raw)) return { ok: false, error: 'Save must be a JSON object.' };
  if (raw.version !== SAVE_VERSION) {
    return { ok: false, error: `Unsupported save version: ${String(raw.version)}.` };
  }
  if (typeof raw.savedAt !== 'string') return { ok: false, error: 'Save is missing savedAt.' };
  const p = raw.payload;
  if (!isRecord(p)) return { ok: false, error: 'Save is missing payload.' };
  if (typeof p.phase !== 'string' || !PHASES.includes(p.phase as SavePhase)) {
    return { ok: false, error: 'Save has an unknown phase.' };
  }
  if (typeof p.seed !== 'number' || !Number.isFinite(p.seed)) {
    return { ok: false, error: 'Save has an invalid seed.' };
  }
  if (p.career !== null) {
    const c = p.career;
    if (!isRecord(c) || typeof c.season !== 'number' || !Array.isArray(c.players)) {
      return { ok: false, error: 'Save has an invalid career.' };
    }
    if (!isRecord(c.rosters) || !Array.isArray(c.careers) || !Array.isArray(c.events)) {
      return { ok: false, error: 'Save has an invalid career.' };
    }
  }
  if (!Array.isArray(p.draftOrder) || !Array.isArray(p.pendingMoments) || !Array.isArray(p.resolvedMoments)) {
    return { ok: false, error: 'Save has invalid queues.' };
  }
  if (p.leagueTeams !== null && !Array.isArray(p.leagueTeams)) {
    return { ok: false, error: 'Save has invalid league teams.' };
  }
  if (p.seasonRun !== undefined && p.seasonRun !== null && !isRecord(p.seasonRun)) {
    return { ok: false, error: 'Save has an invalid season run.' };
  }
  if (p.playoffsRun !== undefined && p.playoffsRun !== null && !isRecord(p.playoffsRun)) {
    return { ok: false, error: 'Save has an invalid playoffs run.' };
  }
  if (isRecord(p.career) && p.career.playerMode !== undefined) {
    const m = p.career.playerMode;
    if (!isRecord(m) || typeof m.playerId !== 'string' || typeof m.coachTrust !== 'number' ||
      typeof m.happiness !== 'number' || typeof m.ambition !== 'number' ||
      typeof m.lifetimeEarnings !== 'number' || !Array.isArray(m.trophies) ||
      !Array.isArray(m.activeObjectives) || !Array.isArray(m.pendingOffers) ||
      typeof m.unhappySeasons !== 'number') {
      return { ok: false, error: 'Save has an invalid player mode.' };
    }
  }
  const save = raw as unknown as CareerSave;
  if (save.payload.career?.playerMode) {
    save.payload.career.playerMode = {
      ...save.payload.career.playerMode,
      careerStats: normalizeCareerStats(save.payload.career.playerMode.careerStats),
      // Saves made before skill points existed load with a zero balance and no focus.
      skillPoints: save.payload.career.playerMode.skillPoints ?? 0,
      trainingFocus: save.payload.career.playerMode.trainingFocus ?? null,
    };
  }
  return { ok: true, save };
}
