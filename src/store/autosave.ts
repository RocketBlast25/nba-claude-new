/**
 * Autosave for the career store: a debounced write of the autosave slot whenever the
 * persisted progress changes. Kept separate from the store so the store only wires it up.
 */
import type { CareerPayload } from '../persistence/snapshot';
import { buildSave } from '../persistence/snapshot';
import {
  defaultSlotStorage,
  writeSlotAsync,
  type AsyncSlotStorage,
} from '../persistence/idbSlots';

/** Delay that coalesces bursts of store updates (for example, one write per game batch). */
export const AUTOSAVE_DEBOUNCE_MS = 250;

/** Minimal store surface the autosave needs (avoids importing the store itself). */
export interface AutosaveSource<S> {
  getState: () => S;
  setState: (partial: Partial<S>) => void;
  subscribe: (listener: (state: S, prev: S) => void) => unknown;
}

/** The store fields autosave reads and writes. */
export interface AutosaveState {
  career: unknown;
  autosavedAt?: number | null;
  autosaveError?: string | null;
}

/** Field names whose change marks progress as needing a save. */
type AutosavedKey = (typeof AUTOSAVED_KEYS)[number];

/**
 * Fields whose change means the career's progress changed and must be saved: phase, season
 * and playoff results, resumable run state, Key Moment queues, rosters and offers.
 */
export const AUTOSAVED_KEYS = [
  'career',
  'phase',
  'userTeamId',
  'season',
  'playoffs',
  'pendingMoments',
  'resolvedMoments',
  'leagueTeams',
  'draftOrder',
  'seasonRun',
  'playoffsRun',
] as const;

/** IndexedDB when the browser has it; an in-memory fallback keeps Node tests working. */
let slots: AsyncSlotStorage | null = null;

export function slotStorage(): AsyncSlotStorage {
  slots ??= defaultSlotStorage();
  return slots;
}

/** Test seam: swap the slot backend used by autosave. */
export function setAutosaveSlotStorage(storage: AsyncSlotStorage | null): void {
  slots = storage;
}

/**
 * Writes the autosave slot now and records the outcome through `record`. Used by the
 * debounced path and by actions that must save immediately (a new career has no phase
 * change for the subscriber to see).
 */
export async function writeAutosaveSlot(
  payload: CareerPayload,
  record: (partial: Partial<AutosaveState>) => void,
): Promise<void> {
  const result = await writeSlotAsync(slotStorage(), 'autosave', buildSave(payload));
  record(
    result.ok ? { autosavedAt: Date.now(), autosaveError: null } : { autosaveError: result.error },
  );
}

/**
 * Starts autosave for a store. Any change to the autosaved keys schedules a debounced write.
 * The store is read when the timer fires, so the latest state is saved. Also flushes a
 * pending write on `pagehide`, so the last debounce window is not lost with the tab.
 * Returns a cleanup that cancels the subscription and any pending timer.
 */
export function startAutosave<S extends AutosaveState>(
  store: AutosaveSource<S>,
  toPayload: (state: S) => CareerPayload,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const writeNow = (payload: CareerPayload): Promise<void> =>
    writeAutosaveSlot(payload, (partial) => store.setState(partial as Partial<S>));

  const unsubscribe: () => void = store.subscribe((state, prev) => {
    if (!state.career) return;
    if (AUTOSAVED_KEYS.every((key: AutosavedKey) => state[key as keyof S] === prev[key as keyof S])) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const current = store.getState();
      if (current.career) void writeNow(toPayload(current));
    }, AUTOSAVE_DEBOUNCE_MS);
  }) as () => void;

  const onPageHide = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    const current = store.getState();
    if (current.career) void writeNow(toPayload(current));
  };

  if (typeof window !== 'undefined') window.addEventListener('pagehide', onPageHide);

  return () => {
    unsubscribe();
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide);
  };
}
