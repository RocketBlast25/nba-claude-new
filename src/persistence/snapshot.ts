/**
 * Pure save-format logic for career persistence (Milestone 7, Phase A).
 * No browser APIs here: storage access lives in `slots.ts`, and this module only
 * builds, serializes and validates plain JSON-safe snapshots.
 */
import type { CareerState } from '../sim/career/types';
import type { KeyMoment, KeyMomentResult } from '../sim/career/types';
import type { DraftPick } from '../sim/league/draft';
import type { PlayoffResult } from '../sim/league/playoffs';
import type { SeasonResult } from '../sim/league/season';
import type { ScheduleTeam } from '../sim/league/schedule';
import type { SimTeam } from '../sim/background/gameSim';

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
 * Parses and validates a save. Rejects unknown versions and structurally wrong data
 * so a bad file can never half-apply to the store.
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
  return { ok: true, save: raw as unknown as CareerSave };
}
