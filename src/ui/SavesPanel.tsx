import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { SLOT_IDS, type SlotId } from '../persistence/slots';
import { playerName, recordOf, seasonRunFinished, snapshotOf, teamLabel, currentSeasonRun } from './careerViewModel';

const SLOT_LABELS: Record<SlotId, string> = {
  slot1: 'Manual slot 1',
  slot2: 'Manual slot 2',
  slot3: 'Manual slot 3',
  autosave: 'Autosave',
};

/**
 * Saves: the active career, three manual slots plus autosave, import/export, and the
 * destructive actions (new career, reset) behind an inline confirmation. The autosave
 * is restored automatically on load, so this tab is for managing saves, not finding one.
 */
export function SavesPanel({ onNewCareer }: { onNewCareer?: () => void }) {
  const career = useGameStore((s) => s.career);
  const phase = useGameStore((s) => s.phase);
  const seasonRun = useGameStore((s) => s.seasonRun);
  const playoffsRun = useGameStore((s) => s.playoffsRun);
  const season = useGameStore((s) => s.season);
  const playoffs = useGameStore((s) => s.playoffs);
  const leagueTeams = useGameStore((s) => s.leagueTeams);
  const saveToSlot = useGameStore((s) => s.saveToSlot);
  const loadFromSlot = useGameStore((s) => s.loadFromSlot);
  const exportSave = useGameStore((s) => s.exportSave);
  const importSave = useGameStore((s) => s.importSave);
  const reset = useGameStore((s) => s.reset);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<'new' | 'reset' | null>(null);

  const snapshot = snapshotOf({ career, phase, season, playoffs, seasonRun, playoffsRun, leagueTeams });
  const record = recordOf(snapshot);
  const run = currentSeasonRun(snapshot);
  const player = career?.players.find((p) => p.id === career.playerMode?.playerId) ?? null;

  const onSave = async (slot: SlotId) => {
    const result = await saveToSlot(slot);
    setMessage(result.ok ? `Saved to ${SLOT_LABELS[slot]}.` : `Save failed: ${result.error}`);
  };

  const onLoad = async (slot: SlotId) => {
    const ok = await loadFromSlot(slot);
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
    <div className="stack">
      <section className="panel" aria-label="Active career">
        <div className="panel-head">
          <h2>Saves</h2>
          <span className="pill">{career ? 'Saved automatically' : 'No active career'}</span>
        </div>
        {career ? (
          <>
            <p>
              <strong>{player ? playerName(career, player.id) : 'No player selected'}</strong> ·{' '}
              {teamLabel(career, career.userTeamId)} · Season {career.season}
              {record ? ` · ${record.label}` : ''}
            </p>
            <p className="muted">
              Your career is restored automatically when you reload the page. Use a manual
              slot to keep a checkpoint before a big decision.
            </p>
            <div className="row-actions">
              <button type="button" className="secondary" onClick={() => onSave('autosave')}>
                Save now
              </button>
              <button type="button" className="ghost" onClick={onExport}>
                Export JSON
              </button>
              <label className="file-label">
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
            {run && !seasonRunFinished(run) ? (
              <p className="muted">Season in progress: {run.nextGame} games played.</p>
            ) : null}
          </>
        ) : (
          <>
            <p className="muted">No career is loaded. Start one, or import a save file.</p>
            <div className="row-actions">
              <button type="button" className="primary" onClick={() => onNewCareer?.()}>
                New career
              </button>
              <label className="file-label">
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
          </>
        )}
        {message ? <p role="status">{message}</p> : null}
      </section>

      <section className="panel" aria-label="Save slots">
        <h2>Save slots</h2>
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
                  <button type="button" className="secondary" onClick={() => onSave(slot)} disabled={!career}>
                    Save
                  </button>
                  <button type="button" className="ghost" onClick={() => onLoad(slot)}>
                    Load
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">Autosave is also restored for you on page load.</p>
      </section>

      <section className="panel danger-zone" aria-label="Start over">
        <h2>Start over</h2>
        <p className="muted">Starting a new career or resetting overwrites the autosave.</p>
        {pending === null ? (
          <div className="row-actions">
            <button type="button" className="secondary" onClick={() => setPending('new')}>
              New career
            </button>
            <button type="button" className="danger" onClick={() => setPending('reset')} disabled={!career}>
              Reset career
            </button>
          </div>
        ) : (
          <div className="confirm">
            <p role="alert">
              {pending === 'new'
                ? 'Start a new career? The current autosave will be replaced.'
                : 'Reset this career? The current autosave will be cleared.'}
            </p>
            <div className="row-actions">
              <button
                type="button"
                className="danger"
                onClick={() => {
                  if (pending === 'new') onNewCareer?.();
                  else {
                    reset();
                    setMessage('Career reset.');
                  }
                  setPending(null);
                }}
              >
                {pending === 'new' ? 'Yes, start a new career' : 'Yes, reset'}
              </button>
              <button type="button" className="ghost" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
