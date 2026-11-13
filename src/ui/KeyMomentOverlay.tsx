import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ACTION_IDS, ACTION_RULES, decisionCards, type ActionId } from '../possession/decision';
import { createRoll } from './keyMomentRoll';
import type { UserDecision } from '../sim/season/resumableSeason';
import { useGameStore } from '../store/gameStore';
import { currentPlayoffsRun, currentSeasonRun, snapshotOf, teamLabel } from './careerViewModel';

interface Roll {
  actionId: ActionId;
  success: boolean;
  reward: number;
}

/**
 * The single Key Moment surface, mounted once by the shell so a pending moment opens
 * from any tab. It is a real modal: labelled dialog, focus moved in and trapped,
 * background scrolling locked, and no way to leave without resolving the moment.
 */
export function KeyMomentOverlay() {
  const career = useGameStore((s) => s.career);
  const phase = useGameStore((s) => s.phase);
  const season = useGameStore((s) => s.season);
  const playoffs = useGameStore((s) => s.playoffs);
  const seasonRun = useGameStore((s) => s.seasonRun);
  const playoffsRun = useGameStore((s) => s.playoffsRun);
  const seed = useGameStore((s) => s.seed);
  const resolveSeasonMoment = useGameStore((s) => s.resolveSeasonMoment);
  const resolvePlayoffMoment = useGameStore((s) => s.resolvePlayoffMoment);
  const [roll, setRoll] = useState<Roll | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);

  const snapshot = snapshotOf({ career, phase, season, playoffs, seasonRun, playoffsRun, leagueTeams: null });
  const seasonMoment = currentSeasonRun(snapshot)?.pending ?? null;
  const playoffMoment = currentPlayoffsRun(snapshot)?.pending ?? null;
  const moment = seasonMoment ?? playoffMoment;
  const kind: 'season' | 'playoffs' | null = seasonMoment ? 'season' : playoffMoment ? 'playoffs' : null;
  const key = moment && kind ? `${kind}-${moment.gameIndex}` : null;

  // A new moment starts unrolled, with focus on the first choice.
  useEffect(() => {
    setRoll(null);
    if (key) firstButtonRef.current?.focus();
  }, [key]);

  // Lock background scroll while the modal is up.
  useEffect(() => {
    if (!key) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [key]);

  if (!moment || !kind || !career) return null;
  const player = career.players.find((p) => p.id === career.playerMode?.playerId);
  if (!player) return null;

  const chances = decisionCards(player.attributes);
  const rollSeed = seed + career.season + moment.gameIndex;

  const choose = (actionId: ActionId) => {
    const result = createRoll(actionId, player.attributes, rollSeed);
    setRoll({ actionId, ...result });
  };

  const continueRun = (decision: UserDecision) => {
    if (kind === 'season') resolveSeasonMoment(decision);
    else resolvePlayoffMoment(decision);
    setRoll(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])');
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const title = kind === 'playoffs' ? 'Playoff Key Moment' : 'Key Moment';

  return (
    <div className="overlay">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby="key-moment-context"
        className="key-moment"
        ref={dialogRef}
        onKeyDown={onKeyDown}
      >
        <header className="key-moment-head">
          <p className="eyebrow">{title}</p>
          <h2 id="key-moment-context">
            {teamLabel(career, moment.awayId)} at {teamLabel(career, moment.homeId)}
          </h2>
          <p className="muted">
            {kind === 'playoffs' ? 'Playoff game' : 'Game'} {moment.gameIndex + 1} · {player.name} has the ball.
          </p>
        </header>

        {roll ? (
          <div className="key-moment-result">
            <p role="status">
              <strong>{ACTION_RULES[roll.actionId].name}</strong>: {roll.success ? 'Success' : 'Turnover'}
              {roll.success ? ` (+${roll.reward})` : ''}
            </p>
            <button
              type="button"
              className="primary"
              onClick={() => continueRun({ success: roll.success, reward: roll.reward })}
              ref={firstButtonRef}
            >
              {kind === 'playoffs' ? 'Continue Playoffs' : 'Continue Season'}
            </button>
          </div>
        ) : (
          <div role="group" aria-label="Choose an action" className="action-grid">
            {ACTION_IDS.map((id, i) => (
              <button
                key={id}
                type="button"
                className="action-card"
                onClick={() => choose(id)}
                ref={i === 0 ? firstButtonRef : undefined}
              >
                <span className="action-name">{ACTION_RULES[id].name}</span>
                <span className="action-chance">{Math.round(chances[id] * 100)}% success</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
