import type { GameBoxScoreRecord } from '../sim/league/season';

/** Player box-score lines for one game. Shown when a game row is opened. */
export function BoxScorePanel({
  record,
  rosterByTeam,
  onClose,
}: {
  record: GameBoxScoreRecord;
  /** Player ids on each team, so lines can be grouped without guessing from ids. */
  rosterByTeam: Record<string, string[]>;
  onClose: () => void;
}) {
  const teams = [record.homeId, record.awayId] as const;
  return (
    <section aria-label={`Box score ${record.gameId}`}>
      <h2>
        {record.awayId} at {record.homeId}
      </h2>
      <button type="button" onClick={onClose}>
        Close
      </button>
      {teams.map((teamId) => {
        const ids = new Set(rosterByTeam[teamId] ?? []);
        const lines = record.lines.filter((l) => ids.has(String(l.playerId)));
        return (
          <table key={teamId}>
            <caption>{teamId}</caption>
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">MIN</th>
                <th scope="col">PTS</th>
                <th scope="col">REB</th>
                <th scope="col">AST</th>
                <th scope="col">STL</th>
                <th scope="col">BLK</th>
                <th scope="col">FGM-FGA</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.playerId}>
                  <td>{l.playerId}</td>
                  <td>{l.minutes}</td>
                  <td>{l.points}</td>
                  <td>{l.rebounds}</td>
                  <td>{l.assists}</td>
                  <td>{l.steals}</td>
                  <td>{l.blocks}</td>
                  <td>
                    {l.fgm}-{l.fga}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
    </section>
  );
}
