import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { checkRotation } from '../sim/league/rotation';
import type { Player } from '../sim/core/models';
import type { TeamId } from '../sim/core/types';
import { LEAGUE_CONFIG } from '../sim/league/leagueConfig';

type Result = { ok: true } | { ok: false; reason: string };

function resultText(r: Result, okText: string): string {
  return r.ok ? okText : r.reason;
}

/** The user's roster as Player records, in roster order. */
function useUserRoster(): { roster: Player[]; ids: Player['id'][] } {
  const career = useGameStore((s) => s.career);
  const userTeamId = useGameStore((s) => s.userTeamId);
  const ids = career && userTeamId ? (career.rosters[userTeamId] ?? []) : [];
  const roster = ids
    .map((id) => career?.players.find((p) => p.id === id))
    .filter((p): p is Player => p !== undefined);
  return { roster, ids };
}

/** Rotation editor: choose the starters (first five) and bench order. */
export function RotationEditor() {
  const { roster, ids } = useUserRoster();
  const career = useGameStore((s) => s.career);
  const userTeamId = useGameStore((s) => s.userTeamId);
  const setUserRotation = useGameStore((s) => s.setUserRotation);
  const current = (career && userTeamId && career.rotations?.[userTeamId]) || ids;
  const [message, setMessage] = useState<string | null>(null);
  const [order, setOrder] = useState<Player['id'][] | null>(null);
  const working = order ?? current;

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= working.length) return;
    const next = [...working];
    const [moved] = next.splice(index, 1);
    if (moved === undefined) return;
    next.splice(target, 0, moved);
    setOrder(next);
  };

  const save = () => {
    const r = setUserRotation(working);
    setMessage(resultText(r, 'Rotation saved.'));
    if (r.ok) setOrder(null);
  };

  const check = checkRotation(working, ids);

  return (
    <section aria-label="Rotation editor" className="card">
      <h3>Rotation</h3>
      <p>The first {LEAGUE_CONFIG.rotation.starters} players start. Move players up or down to change the order.</p>
      <ol className="stat-list">
        {working.map((id, i) => {
          const p = roster.find((r) => r.id === id);
          return (
            <li key={id}>
              <span>
                {p?.name ?? id}
                {i < LEAGUE_CONFIG.rotation.starters ? ' (starter)' : ''}
              </span>{' '}
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${p?.name ?? id} up`}>
                Up
              </button>{' '}
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === working.length - 1}
                aria-label={`Move ${p?.name ?? id} down`}
              >
                Down
              </button>
            </li>
          );
        })}
      </ol>
      {!check.ok ? <p role="alert">{check.reason}</p> : null}
      <button type="button" onClick={save} disabled={!check.ok}>
        Save rotation
      </button>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}

/** Trade builder: pick players from each side and check salary matching before trading. */
export function TradeBuilder() {
  const career = useGameStore((s) => s.career);
  const userTeamId = useGameStore((s) => s.userTeamId);
  const tradeWithTeam = useGameStore((s) => s.tradeWithTeam);
  const { roster } = useUserRoster();
  const [otherTeamId, setOtherTeamId] = useState<TeamId | ''>('');
  const [sendUser, setSendUser] = useState<Player['id'][]>([]);
  const [sendOther, setSendOther] = useState<Player['id'][]>([]);
  const [message, setMessage] = useState<string | null>(null);

  if (!career || !userTeamId) return null;
  const otherTeams = (Object.keys(career.rosters) as TeamId[]).filter((t) => t !== userTeamId);
  const otherRoster = otherTeamId
    ? (career.rosters[otherTeamId] ?? []).map((id) => career.players.find((p) => p.id === id)).filter((p): p is Player => !!p)
    : [];

  const toggle = (list: Player['id'][], id: Player['id'], set: (v: Player['id'][]) => void) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const submit = () => {
    if (!otherTeamId) return setMessage('Pick a team to trade with.');
    const r = tradeWithTeam({ otherTeamId, sendUser, sendOther });
    setMessage(resultText(r, 'Trade completed.'));
    if (r.ok) {
      setSendUser([]);
      setSendOther([]);
    }
  };

  return (
    <section aria-label="Trade builder" className="card">
      <h3>Trades</h3>
      <label>
        Trade partner{' '}
        <select value={otherTeamId} onChange={(e) => setOtherTeamId(e.target.value as TeamId)}>
          <option value="">Choose a team</option>
          {otherTeams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <div className="two-col">
        <fieldset>
          <legend>You send</legend>
          {roster.map((p) => (
            <label key={p.id} className="check-row">
              <input type="checkbox" checked={sendUser.includes(p.id)} onChange={() => toggle(sendUser, p.id, setSendUser)} />{' '}
              {p.name} (${p.contract.salary})
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>You receive</legend>
          {otherRoster.map((p) => (
            <label key={p.id} className="check-row">
              <input type="checkbox" checked={sendOther.includes(p.id)} onChange={() => toggle(sendOther, p.id, setSendOther)} />{' '}
              {p.name} (${p.contract.salary})
            </label>
          ))}
        </fieldset>
      </div>
      <button type="button" onClick={submit} disabled={sendUser.length === 0 && sendOther.length === 0}>
        Propose trade
      </button>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}

/** Free agency: players on no roster. Offers sign when cap space and a roster spot exist. */
export function FreeAgencyPanel() {
  const career = useGameStore((s) => s.career);
  const offerFreeAgent = useGameStore((s) => s.offerFreeAgent);
  const [message, setMessage] = useState<string | null>(null);

  if (!career) return null;
  const rostered = new Set(Object.values(career.rosters).flat());
  const pool = career.players
    .filter((p) => !rostered.has(p.id))
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 10);

  return (
    <section aria-label="Free agency" className="card">
      <h3>Free agency</h3>
      {pool.length === 0 ? <p>No free agents available.</p> : null}
      <table className="stat-table">
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col">Overall</th>
            <th scope="col">Offer</th>
          </tr>
        </thead>
        <tbody>
          {pool.map((p) => (
            <tr key={p.id}>
              <th scope="row">{p.name}</th>
              <td className="num">{p.overall}</td>
              <td>
                <button
                  type="button"
                  onClick={() => setMessage(resultText(offerFreeAgent(p.id), `Signed ${p.name}.`))}
                >
                  Offer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
