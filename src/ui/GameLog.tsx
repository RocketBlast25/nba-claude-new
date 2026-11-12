import { useState } from 'react';
import { useGameStore, selectBoxScore } from '../store/gameStore';
import { BoxScorePanel } from './BoxScorePanel';

/** Clickable list of the season's games. Opening a row shows its player box score. */
export function GameLog() {
  const season = useGameStore((s) => s.season);
  const teams = useGameStore((s) => s.leagueTeams);
  const [openId, setOpenId] = useState<string | null>(null);

  if (!season) return null;
  const record = openId ? selectBoxScore(season, openId) : undefined;
  const rosterByTeam = Object.fromEntries(
    (teams ?? []).map((t) => [t.id, t.sim.players.map((p) => String(p.id))]),
  );

  return (
    <section aria-label="Game log">
      <h2>Games</h2>
      <ul>
        {season.gameBoxScores.map((rec) => (
          <li key={rec.gameId}>
            <button type="button" onClick={() => setOpenId(String(rec.gameId))}>
              {rec.awayId} at {rec.homeId}
            </button>
          </li>
        ))}
      </ul>
      {record && (
        <BoxScorePanel record={record} rosterByTeam={rosterByTeam} onClose={() => setOpenId(null)} />
      )}
    </section>
  );
}
