import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { SLOT_IDS, type SlotId } from '../persistence/slots';

const SLOT_LABELS: Record<SlotId, string> = {
  slot1: 'Manual slot 1',
  slot2: 'Manual slot 2',
  slot3: 'Manual slot 3',
  autosave: 'Autosave',
};

/**
 * Save management: writes the career to a manual slot, loads a slot, and exports or
 * imports the career as a JSON file. All persistence logic lives in the store and
 * the pure persistence modules; this panel only wires buttons to them.
 */
export function SavesPanel() {
  const career = useGameStore((s) => s.career);
  const saveToSlot = useGameStore((s) => s.saveToSlot);
  const loadFromSlot = useGameStore((s) => s.loadFromSlot);
  const exportSave = useGameStore((s) => s.exportSave);
  const importSave = useGameStore((s) => s.importSave);
  const [message, setMessage] = useState<string | null>(null);

  const onSave = (slot: SlotId) => {
    const result = saveToSlot(slot);
    setMessage(result.ok ? `Saved to ${SLOT_LABELS[slot]}.` : `Save failed: ${result.error}`);
  };

  const onLoad = (slot: SlotId) => {
    const ok = loadFromSlot(slot);
    setMessage(ok ? `Loaded ${SLOT_LABELS[slot]}.` : `${SLOT_LABELS[slot]} is empty or invalid.`);
  };

  const onExport = () => {
    const text = exportSave();
    if (!text) {
      setMessage('Nothing to export yet.');
      return;
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'nba-career-save.json';
    link.click();
    URL.revokeObjectURL(url);
    setMessage('Save exported.');
  };

  const onImport = async (file: File) => {
    const result = importSave(await file.text());
    setMessage(result.ok ? 'Save imported.' : `Import failed: ${result.error}`);
  };

  return (
    <section aria-label="Saves" className="card">
      <h2>Saves</h2>
      {!career ? <p>Start a career to save it.</p> : null}
      <table className="stat-table">
        <thead>
          <tr>
            <th scope="col">Slot</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {SLOT_IDS.map((slot) => (
            <tr key={slot}>
              <th scope="row">{SLOT_LABELS[slot]}</th>
              <td className="row-actions">
                <button type="button" onClick={() => onSave(slot)} disabled={!career}>
                  Save
                </button>
                <button type="button" onClick={() => onLoad(slot)}>
                  Load
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row-actions">
        <button type="button" onClick={onExport} disabled={!career}>
          Export JSON
        </button>
        <label>
          Import JSON{' '}
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImport(file);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
