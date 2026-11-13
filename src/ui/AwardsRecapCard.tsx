import { useGameStore } from '../store/gameStore';
import type { AwardRecapEntry, RecapAwardKind } from '../sim/career/awardsRecap';
import type { PlayerId, TeamId } from '../sim/core/types';
import { playerName, teamLabel } from './careerViewModel';

const AWARD_TITLES: Record<RecapAwardKind, string> = {
  mvp: 'Most Valuable Player',
  dpoy: 'Defensive Player of the Year',
  all_league: 'All-NBA',
  finals_mvp: 'Finals MVP',
};

const pct = (share: number): string => `${Math.round(share * 1000) / 10}%`;

/** The team a player is on, from the career's rosters (null when unrostered). */
function teamOf(career: NonNullable<ReturnType<typeof useGameStore.getState>['career']>, playerId: PlayerId) {
  for (const [teamId, ids] of Object.entries(career.rosters) as [TeamId, PlayerId[]][]) {
    if (ids.includes(playerId)) return teamId;
  }
  return null;
}

/**
 * Awards recap after the regular season or the Finals. Read-only: winners and vote
 * shares come from the store, which builds them from the same rules as the trophies.
 */
export function AwardsRecapCard() {
  const recap = useGameStore((s) => s.awardsRecap);
  const career = useGameStore((s) => s.career);
  const dismiss = useGameStore((s) => s.dismissAwardsRecap);

  if (!recap || !career) return null;
  const userId = career.playerMode?.playerId ?? null;
  const heading = recap.stage === 'finals' ? 'Finals Awards' : `${recap.season} Season Awards`;
  const userAwardLabels = recap.userAwards.map((kind) => AWARD_TITLES[kind]);

  return (
    <div className="overlay">
      <div role="dialog" aria-modal="true" aria-label={heading} className="key-moment awards-recap">
        <div className="key-moment-head">
          <h2>{heading}</h2>
          <p className="muted">
            {userAwardLabels.length > 0
              ? `You won: ${userAwardLabels.join(', ')}.`
              : 'No awards for your player this time.'}
          </p>
        </div>
        {recap.entries.map((entry) => (
          <AwardBallot key={entry.kind} entry={entry} career={career} userId={userId} />
        ))}
        <div className="key-moment-result">
          <button type="button" onClick={dismiss}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function AwardBallot({
  entry,
  career,
  userId,
}: {
  entry: AwardRecapEntry;
  career: NonNullable<ReturnType<typeof useGameStore.getState>['career']>;
  userId: string | null;
}) {
  return (
    <section className="awards-ballot" aria-label={AWARD_TITLES[entry.kind]}>
      <h3>{AWARD_TITLES[entry.kind]}</h3>
      <p>
        Winner: <strong>{playerName(career, entry.winnerId)}</strong>
      </p>
      <table className="awards-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>Team</th>
            <th>Vote share</th>
          </tr>
        </thead>
        <tbody>
          {entry.top.map((row) => {
            const isUser = row.playerId === userId;
            const teamId = teamOf(career, row.playerId);
            return (
              <tr key={row.playerId} className={isUser ? 'awards-user-row' : undefined}>
                <td>{row.rank}</td>
                <td>{playerName(career, row.playerId)}</td>
                <td>{teamLabel(career, teamId)}</td>
                <td>{pct(row.share)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {entry.userRank !== null && entry.userRank > entry.top.length ? (
        <p className="muted">Your player finished #{entry.userRank} on this ballot.</p>
      ) : null}
    </section>
  );
}
