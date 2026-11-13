import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { checkRotation } from '../sim/league/rotation';
import type { Player } from '../sim/core/models';
import type { TeamId } from '../sim/core/types';
import { LEAGUE_CONFIG } from '../sim/league/leagueConfig';
import { findTradeDestination, scoreOfferForPlayer, type CareerPriority } from '../sim/career/freeAgency';
import { shouldRequestTrade } from '../sim/career/playerMode';
import { selectContractSummary, selectTradeTargets } from './mycareerSelectors';
import { teamLabel, type TabId } from './careerViewModel';

type Result = { ok: true } | { ok: false; reason: string };

function resultText(r: Result, okText: string): string {
  return r.ok ? okText : r.reason;
}

const PRIORITIES: { id: CareerPriority; label: string }[] = [
  { id: 'max_money', label: 'Max Money' },
  { id: 'ring_chasing', label: 'Ring Chasing' },
  { id: 'market_size', label: 'Market Size' },
];

type Tool = 'Rotation' | 'Trades' | 'Free agency';
const TOOLS: Tool[] = ['Rotation', 'Trades', 'Free agency'];

/**
 * Front Office: the player's contract, this offseason's offers, and trade requests,
 * with the franchise-level GM tools folded into a collapsed disclosure so they never
 * mix with the MyCareer flow.
 */
export function FrontOfficePanel({ onNavigate }: { onNavigate?: (tab: TabId) => void }) {
  const career = useGameStore((s) => s.career);
  const requestPlayerTrade = useGameStore((s) => s.requestPlayerTrade);
  const signPlayerOffer = useGameStore((s) => s.signPlayerOffer);
  const declineAllOffers = useGameStore((s) => s.declineAllOffers);
  const [priority, setPriority] = useState<CareerPriority>('max_money');
  const [tradeResult, setTradeResult] = useState<string | null>(null);
  const [offerResult, setOfferResult] = useState<string | null>(null);

  if (!career) {
    return (
      <section className="panel" aria-label="Front Office">
        <h2>Front Office</h2>
        <p className="muted">Start a career to manage your contract.</p>
      </section>
    );
  }

  const player = career.players.find((p) => p.id === career.playerMode?.playerId) ?? null;
  if (!player) {
    return (
      <section className="panel" aria-label="Front Office">
        <h2>Front Office</h2>
        <p className="muted">Pick your player first.</p>
        <button type="button" className="secondary" onClick={() => onNavigate?.('mycareer')}>
          Choose your player
        </button>
      </section>
    );
  }

  const contract = selectContractSummary(player);
  const tradeStreak = career.careers.find((c) => c.playerId === player.id)?.unsignedOffseasons ?? 0;
  const tradeTargets = shouldRequestTrade(tradeStreak) ? findTradeDestination(career, player.id) : [];
  const destinations = selectTradeTargets(tradeTargets, career.teams).map((t) => ({
    id: t.id,
    name: teamLabel(career, t.id),
  }));
  const offers = contract.expiring
    ? (career.playerMode?.pendingOffers ?? [])
        .map((o) => ({ ...o, score: scoreOfferForPlayer(o, priority) }))
        .sort((a, b) => b.score - a.score)
    : [];

  return (
    <section aria-label="Front Office" className="stack">
      <div className="panel-head">
        <h2>Front Office</h2>
        <span className="pill">{teamLabel(career, career.userTeamId)}</span>
      </div>

      <div className="grid-2">
        <section className="panel" aria-label="Contract">
          <h3>Your contract</h3>
          <dl className="stat-grid">
            <div>
              <dt>Salary</dt>
              <dd>${contract.salary.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Years left</dt>
              <dd>{contract.yearsLeft}</dd>
            </div>
            <div>
              <dt>Total value</dt>
              <dd>${contract.totalValue.toLocaleString()}</dd>
            </div>
          </dl>
          {contract.expiring ? (
            <p className="warn">
              {offers.length > 0
                ? 'Your contract is up: pick an offer below.'
                : 'Your contract is up. Offers arrive when the offseason runs.'}
            </p>
          ) : (
            <p className="muted">You are under contract through the end of this deal.</p>
          )}
        </section>

        <section className="panel" aria-label="Trade request">
          <h3>Trade request</h3>
          {destinations.length > 0 ? (
            <>
              <p className="muted">Eligible destinations: {destinations.map((d) => d.name).join(', ')}</p>
              <button
                type="button"
                className="secondary"
                onClick={() => setTradeResult(describeTrade(requestPlayerTrade(destinations[0]?.id), career))}
              >
                Request trade
              </button>
            </>
          ) : (
            <p className="muted">
              A trade request unlocks after consecutive unhappy seasons. Keep playing to build your case.
            </p>
          )}
          {tradeResult ? <p role="status">{tradeResult}</p> : null}
        </section>
      </div>

      {contract.expiring ? (
        <section className="panel" aria-label="Free agency offers">
          <h3>Free agency offers</h3>
          <fieldset className="radio-row">
            <legend>Rank offers by</legend>
            {PRIORITIES.map((p) => (
              <label key={p.id}>
                <input
                  type="radio"
                  name="offer-priority"
                  checked={priority === p.id}
                  onChange={() => setPriority(p.id)}
                />
                {p.label}
              </label>
            ))}
          </fieldset>
          {offers.length === 0 ? (
            <p className="muted">No offers on the table yet.</p>
          ) : (
            <ul className="offer-list">
              {offers.map((o) => (
                <li key={o.teamId} className="offer">
                  <div>
                    <strong>{teamLabel(career, o.teamId)}</strong>
                    <p className="muted">
                      ${o.salary.toLocaleString()} for {o.years} yr{o.years === 1 ? '' : 's'} · fit {o.score.toFixed(1)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setOfferResult(describeSigning(signPlayerOffer(o)))}
                  >
                    Sign with {teamLabel(career, o.teamId)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {offers.length > 0 ? (
            <button type="button" className="ghost" onClick={() => declineAllOffers()}>
              Decline all offers
            </button>
          ) : null}
          {offerResult ? <p role="status">{offerResult}</p> : null}
        </section>
      ) : null}

      <GmTools />
    </section>
  );
}

/** Franchise-level controls, deliberately collapsed and labelled as GM tools. */
function GmTools() {
  const [tool, setTool] = useState<Tool>('Rotation');
  return (
    <details className="panel gm-tools">
      <summary>
        <strong>GM tools</strong> <span className="muted">(franchise controls: rotation, trades, free agents)</span>
      </summary>
      <p className="hint">
        These change the whole team rather than your player's career. Day-to-day progress
        stays on the Home tab.
      </p>
      <div role="group" aria-label="GM tools sections" className="pillbar">
        {TOOLS.map((name) => (
          <button
            key={name}
            type="button"
            className="pill-button"
            aria-pressed={tool === name}
            onClick={() => setTool(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {tool === 'Rotation' ? <RotationEditor /> : null}
      {tool === 'Trades' ? <TradeBuilder /> : null}
      {tool === 'Free agency' ? <FreeAgencyPanel /> : null}
    </details>
  );
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
function RotationEditor() {
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
    <section aria-label="Rotation editor">
      <p className="muted">
        The first {LEAGUE_CONFIG.rotation.starters} players start. Move players to change the rotation.
      </p>
      <ol className="stat-list">
        {working.map((id, i) => {
          const p = roster.find((r) => r.id === id);
          return (
            <li key={id}>
              <span>
                {p?.name ?? id}
                {i < LEAGUE_CONFIG.rotation.starters ? ' (starter)' : ''}
              </span>{' '}
              <button type="button" className="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${p?.name ?? id} up`}>
                Up
              </button>{' '}
              <button
                type="button"
                className="ghost"
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
      <button type="button" className="secondary" onClick={save} disabled={!check.ok}>
        Save rotation
      </button>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}

/** Trade builder: pick players from each side and check salary matching before trading. */
function TradeBuilder() {
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
    ? (career.rosters[otherTeamId] ?? [])
        .map((id) => career.players.find((p) => p.id === id))
        .filter((p): p is Player => !!p)
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
    <section aria-label="Trade builder">
      <label>
        Trade partner{' '}
        <select value={otherTeamId} onChange={(e) => setOtherTeamId(e.target.value as TeamId)}>
          <option value="">Choose a team</option>
          {otherTeams.map((t) => (
            <option key={t} value={t}>
              {teamLabel(career, t)}
            </option>
          ))}
        </select>
      </label>
      <div className="grid-2">
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
      <button type="button" className="secondary" onClick={submit} disabled={sendUser.length === 0 && sendOther.length === 0}>
        Propose trade
      </button>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}

/** Free agency: players on no roster. Offers sign when cap space and a roster spot exist. */
function FreeAgencyPanel() {
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
    <section aria-label="Free agency">
      {pool.length === 0 ? <p className="muted">No free agents available.</p> : null}
      {pool.length > 0 ? (
        <table className="stat-table">
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col" className="num">Overall</th>
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
                    className="ghost"
                    onClick={() => setMessage(resultText(offerFreeAgent(p.id), `Signed ${p.name}.`))}
                  >
                    Offer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}

/** Live trade feedback: the approved destination, or the store's rejection reason. */
function describeTrade(
  result: { ok: true; otherTeamId: string } | { ok: false; reason: string },
  career: NonNullable<ReturnType<typeof useGameStore.getState>['career']>,
): string {
  return result.ok
    ? `Trade approved: moved to ${teamLabel(career, result.otherTeamId)}.`
    : `Trade rejected: ${result.reason}.`;
}

/** Live signing feedback for a free agency offer. */
function describeSigning(result: { ok: true } | { ok: false; reason: string }): string {
  return result.ok ? 'Offer signed.' : `Signing failed: ${result.reason}.`;
}
