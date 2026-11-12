/**
 * localStorage adapter for 3 manual save slots plus one autosave slot.
 * Thin I/O only: validation and format live in `snapshot.ts` (pure).
 */
import { parseSave, serializeSave, type CareerSave } from './snapshot';

export const MANUAL_SLOT_COUNT = 3;
export type SlotId = 'slot1' | 'slot2' | 'slot3' | 'autosave';
export const SLOT_IDS: readonly SlotId[] = ['slot1', 'slot2', 'slot3', 'autosave'];

const KEY_PREFIX = 'nba-career:save:';

export interface SlotStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type SlotWriteResult = { ok: true } | { ok: false; error: string };

function keyFor(slot: SlotId): string {
  return `${KEY_PREFIX}${slot}`;
}

/** Returns the stored save for a slot, or null when the slot is empty or unreadable. */
export function readSlot(storage: SlotStorage, slot: SlotId): CareerSave | null {
  const raw = storage.getItem(keyFor(slot));
  if (raw === null) return null;
  const parsed = parseSave(raw);
  return parsed.ok ? parsed.save : null;
}

/** Writes a serialized save. Reports quota or storage failures instead of throwing. */
export function writeSlot(storage: SlotStorage, slot: SlotId, save: CareerSave): SlotWriteResult {
  try {
    storage.setItem(keyFor(slot), serializeSave(save));
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown storage error';
    return { ok: false, error: `Could not write ${slot}: ${message}` };
  }
}

export function deleteSlot(storage: SlotStorage, slot: SlotId): void {
  storage.removeItem(keyFor(slot));
}
