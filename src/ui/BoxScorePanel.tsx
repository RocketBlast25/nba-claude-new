import type { GameBoxScoreRecord } from '../sim/league/season';

/**
 * Player box-score lines for one game, grouped by team. Player and team ids are
 * resolved to names by the caller so a legacy save without team data still renders.
 */
export function BoxScorePanel({
  record,
  rosterByTeam,
  onClose,
  nameOf = (id) => id,
  teamNameOf = (id) => id,
}: {
  record: GameBoxScoreRecord;
  /** Player ids on each team, so lines can be grouped without guessing from ids. */
  rosterByTeam: Record<string, string[]>;
  onClose: () => void;
  nameOf?: (playerId: string) => string;
  teamNameOf?: (teamId: string) => string;
}) {
  const teams = [record.homeId, record.awayId] as const;
  return (
    <section aria-label={`Box score ${record.gameId}`} className="panel">
      <div className="panel-head">
        <h3>
          {teamNameOf(record.awayId)} at {teamNameOf(record.homeId)}
        </h3>
        <button type="button" className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
      {teams.map((teamId) => {
        const ids = new Set(rosterByTeam[teamId] ?? []);
        const lines = record.lines.filter((l) => ids.has(String(l.playerId)));
        return (
          <table key={teamId} className="stat-table">
            <caption>{teamNameOf(teamId)}</caption>
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col" className="num">MIN</th>
                <th scope="col" className="num">PTS</th>
                <th scope="col" className="num">REB</th>
                <th scope="col" className="num">AST</th>
                <th scope="col" className="num">STL</th>
                <th scope="col" className="num">BLK</th>
                <th scope="col" className="num">FGM–FGA</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.playerId}>
                  <th scope="row">{nameOf(String(l.playerId))}</th>
                  <td className="num">{l.minutes}</td>
                  <td className="num">{l.points}</td>
                  <td className="num">{l.rebounds}</td>
                  <td className="num">{l.assists}</td>
                  <td className="num">{l.steals}</td>
                  <td className="num">{l.blocks}</td>
                  <td className="num">
                    {l.fgm}–{l.fga}
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
