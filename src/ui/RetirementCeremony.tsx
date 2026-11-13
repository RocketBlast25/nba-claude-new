import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { canRetire, shouldPromptRetirement, type HallOfFameEntry } from '../sim/career/hallOfFame';
import { playerName } from './careerViewModel';

/**
 * Retirement is offered from age 38 and can be chosen at any time from the player's
 * own career. Retiring locks the career into the Hall of Fame and shows the induction.
 */
export function RetirementCeremony() {
  const career = useGameStore((s) => s.career);
  const hallOfFame = useGameStore((s) => s.hallOfFame);
  const retire = useGameStore((s) => s.retireAndEnterHallOfFame);
  const loadHallOfFame = useGameStore((s) => s.loadHallOfFame);
  const [inducted, setInducted] = useState<HallOfFameEntry | null>(null);
  const [dismissedPrompt, setDismissedPrompt] = useState(false);

  useEffect(() => {
    void loadHallOfFame();
  }, [loadHallOfFame]);

  const userId = career?.playerMode?.playerId ?? null;
  const onRetire = () => {
    const result = retire();
    if (result.ok) setInducted(result.entry);
  };

  if (inducted) {
    return <InductionOverlay entry={inducted} onClose={() => setInducted(null)} />;
  }

  if (!career || !userId) return <HallOfFameRoom entries={hallOfFame} />;

  const eligible = canRetire(career, userId);
  const prompt = shouldPromptRetirement(career, userId) && !dismissedPrompt;
  const name = playerName(career, userId);

  return (
    <>
      {prompt ? (
        <div className="overlay">
          <div role="dialog" aria-modal="true" aria-label="Retirement" className="key-moment">
            <div className="key-moment-head">
              <h2>Time to retire?</h2>
              <p className="muted">
                {name} is {career.players.find((p) => p.id === userId)?.age ?? ''} years old. You can keep playing, or
                retire now and enter the Hall of Fame.
              </p>
            </div>
            <div className="key-moment-result">
              <button type="button" onClick={onRetire}>
                Retire &amp; Enter Hall of Fame
              </button>{' '}
              <button type="button" className="secondary" onClick={() => setDismissedPrompt(true)}>
                Keep playing
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {eligible ? (
        <section className="panel" aria-label="Retire">
          <h2>Retire</h2>
          <p className="muted">Lock {name}&apos;s career into the Hall of Fame. This can&apos;t be undone.</p>
          <button type="button" onClick={onRetire}>
            Retire &amp; Enter Hall of Fame
          </button>
        </section>
      ) : null}
      <HallOfFameRoom entries={hallOfFame} />
    </>
  );
}

/** The induction summary shown right after retiring. */
function InductionOverlay({ entry, onClose }: { entry: HallOfFameEntry; onClose: () => void }) {
  return (
    <div className="overlay">
      <div role="dialog" aria-modal="true" aria-label="Hall of Fame induction" className="key-moment">
        <div className="key-moment-head">
          <h2>Hall of Fame induction</h2>
          <p>
            <strong>{entry.name}</strong> is inducted after {entry.yearsPro} {entry.yearsPro === 1 ? 'season' : 'seasons'}.
          </p>
          <p className="pill accent">All-time GOAT rank #{entry.goatRank} · {entry.goatScore.toFixed(1)} ({entry.tier})</p>
        </div>
        <ul>
          {entry.highlights.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="key-moment-result">
          <button type="button" onClick={onClose}>
            Enter the trophy room
          </button>
        </div>
      </div>
    </div>
  );
}

/** The persistent trophy room: every retired player's locked-in legacy. */
export function HallOfFameRoom({ entries }: { entries: HallOfFameEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section className="panel" aria-label="Hall of Fame">
      <h2>Hall of Fame</h2>
      <ul>
        {entries.map((e) => (
          <li key={e.playerId}>
            <strong>{e.name}</strong>: #{e.goatRank} all-time · {e.goatScore.toFixed(1)} · retired after {e.retiredSeason}
            {e.highlights.length > 0 ? ` (${e.highlights.join(', ')})` : ''}
          </li>
        ))}
      </ul>
    </section>
  );
}
