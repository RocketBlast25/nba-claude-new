import { useGameStore } from '../store/gameStore';
import type { PlayoffResult } from '../sim/league/playoffs';
import { GAMES_PER_TEAM } from '../sim/league/schedule';
import { winPct } from '../sim/league/standings';
import {
  currentPlayoffsRun,
  currentSeasonRun,
  seasonRunFinished,
  standingsOf,
  teamLabel,
  type GameSnapshot,
} from './careerViewModel';
import { selectSuperstarStandings } from './mycareerSelectors';

const ROUND_NAMES = ['Round 1', 'Conference semis', 'Conference finals', 'NBA Finals'];

/**
 * League & Playoffs: standings, the live or completed bracket, last season's scoring
 * leaders and the draft order. Read-only on purpose: the header's primary action is
 * the only thing that advances the league.
 */
export function LeaguePanel({ snapshot }: { snapshot: GameSnapshot }) {
  const career = snapshot.career;
  if (!career) return null;

  const standings = standingsOf(snapshot);
  const run = currentSeasonRun(snapshot);
  const playoffRun = currentPlayoffsRun(snapshot);
  const bracket: PlayoffResult | null = playoffRun?.result ?? snapshot.playoffs;
  const rounds = bracket?.rounds ?? playoffRun?.rounds ?? null;
  const draftOrder = useGameStore((s) => s.draftOrder);
  const season = snapshot.season;
  const leaders = season && snapshot.phase !== 'offseason' ? selectSuperstarStandings(career, season, career.playerMode?.playerId ?? null, 10) : [];

  return (
    <div className="stack">
      {standings ? (
        <section className="panel" aria-label="Standings">
          <h2>Standings</h2>
          <div className="grid-2">
            {(['East', 'West'] as const).map((conf) => (
              <table key={conf} className="stat-table">
                <caption>{conf}ern Conference</caption>
                <thead>
                  <tr>
                    <th scope="col" className="num">#</th>
                    <th scope="col">Team</th>
                    <th scope="col" className="num">W</th>
                    <th scope="col" className="num">L</th>
                    <th scope="col" className="num">PCT</th>
                  </tr>
                </thead>
                <tbody>
                  {standings
                    .filter((r) => r.conference === conf)
                    .map((r, i) => (
                      <tr key={r.teamId} aria-current={r.teamId === career.userTeamId ? 'true' : undefined}>
                        <td className="num">{i + 1}</td>
                        <th scope="row">{teamLabel(career, r.teamId)}</th>
                        <td className="num">{r.wins}</td>
                        <td className="num">{r.losses}</td>
                        <td className="num">{winPct(r).toFixed(3)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ))}
          </div>
        </section>
      ) : (
        <section className="panel" aria-label="Standings">
          <h2>Standings</h2>
          <p className="muted">The table appears once this season's first game is played.</p>
          <button type="button" className="secondary" disabled>
            Start Season {career.season} from the header
          </button>
        </section>
      )}

      <section className="panel" aria-label="Playoffs">
        <div className="panel-head">
          <h2>Playoffs</h2>
          {bracket ? <span className="pill">Champion: {teamLabel(career, bracket.champion)}</span> : null}
        </div>
        {!bracket && !playoffRun ? (
          <p className="muted">
            {run && !seasonRunFinished(run)
              ? `Regular season in progress: game ${run.nextGame} of ${GAMES_PER_TEAM}. The header's Advance Season button keeps it moving.`
              : 'Playoffs unlock when the regular season ends. The header will offer Start Playoffs.'}
          </p>
        ) : null}
        {playoffRun && !bracket ? (
          <section aria-label="Current series">
            <h3>Current series</h3>
            {playoffRun.series[playoffRun.seriesIndex] ? (
              <p>
                {teamLabel(career, playoffRun.series[playoffRun.seriesIndex]!.higherSeed)}{' '}
                {playoffRun.series[playoffRun.seriesIndex]!.higherWins}–
                {playoffRun.series[playoffRun.seriesIndex]!.lowerWins}{' '}
                {teamLabel(career, playoffRun.series[playoffRun.seriesIndex]!.lowerSeed)}
              </p>
            ) : (
              <p className="muted">The next series is about to start.</p>
            )}
            <p className="muted">Advance Playoffs in the header plays the next game.</p>
          </section>
        ) : null}
        {rounds && rounds.length > 0 ? (
          <div className="stack">
            {rounds.map((series, i) => (
              <div key={i}>
                <h3>{ROUND_NAMES[i] ?? `Round ${i + 1}`}</h3>
                <ul className="series-list">
                  {series.map((s) => (
                    <li key={`${s.higherSeed}-${s.lowerSeed}`} className="series">
                      <span className={s.winner === s.higherSeed ? 'winner' : ''}>
                        {teamLabel(career, s.higherSeed)}
                      </span>
                      <span className="num">
                        {s.higherSeedWins}–{s.lowerSeedWins}
                      </span>
                      <span className={s.winner === s.lowerSeed ? 'winner' : ''}>
                        {teamLabel(career, s.lowerSeed)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {leaders.length > 0 ? (
        <section className="panel" aria-label="Scoring leaders">
          <h2>Scoring leaders</h2>
          <table className="stat-table">
            <thead>
              <tr>
                <th scope="col" className="num">#</th>
                <th scope="col">Player</th>
                <th scope="col">Team</th>
                <th scope="col" className="num">PPG</th>
                <th scope="col" className="num">RPG</th>
                <th scope="col" className="num">APG</th>
              </tr>
            </thead>
            <tbody>
              {leaders.map((row) => (
                <tr key={row.playerId} aria-current={row.isUser ? 'true' : undefined}>
                  <td className="num">{row.rank}</td>
                  <th scope="row">
                    {row.name}
                    {row.isUser ? ' (you)' : ''}
                  </th>
                  <td>{teamLabel(career, row.teamId)}</td>
                  <td className="num">{row.ppg.toFixed(1)}</td>
                  <td className="num">{row.rpg.toFixed(1)}</td>
                  <td className="num">{row.apg.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="panel" aria-label="Draft order">
        <h2>Draft order</h2>
        {draftOrder.length === 0 ? (
          <p className="muted">The board is set when the offseason runs.</p>
        ) : (
          <ol className="draft-list">
            {draftOrder.map((p) => (
              <li key={p.pick} aria-current={p.teamId === career.userTeamId ? 'true' : undefined}>
                <span className="num">Pick {p.pick}</span>
                <span>{teamLabel(career, p.teamId)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
