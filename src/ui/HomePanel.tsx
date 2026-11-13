import { useState } from 'react';
import {
  currentPlayoffsRun,
  currentSeasonRun,
  nextGameOf,
  offseasonView,
  phaseLabel,
  playerName,
  recordOf,
  recentResults,
  seedLabel,
  standingsOf,
  teamLabel,
  type GameSnapshot,
  type NextAction,
  type TabId,
} from './careerViewModel';
import { BoxScorePanel } from './BoxScorePanel';
import { ROLE_LABELS, selectHeader } from './mycareerSelectors';
import { deriveRole } from '../sim/career/playerMode';

/**
 * Home: the one screen a player needs. It answers "what do I do now", shows the
 * player's season at a glance, and keeps the full game log out of the way.
 */
export function HomePanel({
  snapshot,
  action,
  onAction,
  onNavigate,
}: {
  snapshot: GameSnapshot;
  action: NextAction;
  onAction: () => void;
  onNavigate: (tab: TabId) => void;
}) {
  const career = snapshot.career;
  const [openGame, setOpenGame] = useState<string | null>(null);
  if (!career) return null;

  const userTeamId = career.userTeamId;
  const run = currentSeasonRun(snapshot);
  const playoffRun = currentPlayoffsRun(snapshot);
  const record = recordOf(snapshot);
  const next = nextGameOf(snapshot);
  const results = recentResults(snapshot, 5);
  const offseason = offseasonView(snapshot);
  const standings = standingsOf(snapshot);
  const player = career.players.find((p) => p.id === career.playerMode?.playerId) ?? null;
  const roster = (career.rosters[userTeamId] ?? [])
    .map((id) => career.players.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined)
    .sort((a, b) => b.overall - a.overall);
  const role = player ? deriveRoleFor(roster, player.id) : null;
  const header = player ? selectHeader(player, career.playerMode ?? null, role) : null;
  const objectives = career.playerMode?.activeObjectives ?? [];
  const records = run?.gameBoxScores ?? (snapshot.phase === 'offseason' ? [] : snapshot.season?.gameBoxScores ?? []);
  const recentGames = records
    .filter((g) => g.homeId === userTeamId || g.awayId === userTeamId)
    .slice(-8)
    .reverse();
  const record$ = openGame ? records.find((g) => String(g.gameId) === openGame) : undefined;
  const rosterByTeam = Object.fromEntries(
    (Object.entries(career.rosters) as [string, string[]][]).map(([id, ids]) => [id, ids.map(String)]),
  );

  return (
    <div className="home">
      <section className={`panel action-panel ${action.enabled ? '' : 'is-blocked'}`} aria-label="What's next">
        <p className="eyebrow">What&apos;s next</p>
        <h2>{action.label}</h2>
        <p className="muted">{action.detail}</p>
        <button type="button" className="primary" onClick={onAction} disabled={!action.enabled}>
          {action.label}
        </button>
        {!action.enabled ? (
          <p className="warn">
            This save has no league data, so games cannot be played.{' '}
            <button type="button" className="link" onClick={() => onNavigate('saves')}>
              Start a new career
            </button>
          </p>
        ) : null}
      </section>

      <div className="grid-2">
        <section className="panel" aria-label="Season at a glance">
          <div className="panel-head">
            <h3>Season {career.season}</h3>
            <span className="pill">{phaseLabel(snapshot.phase)}</span>
          </div>
          <p className="big-stat">
            {record ? (
              <>
                {record.label} {record.conference ? <span className="muted">{seedLabel(record)}</span> : null}
              </>
            ) : (
              <span className="muted">No games played yet</span>
            )}
          </p>
          {playoffRun && !playoffRun.result ? (
            <p className="muted">
              Playoffs: {playoffRoundLabel(playoffRun.round)}
              {playoffRun.series[playoffRun.seriesIndex]
                ? ` · ${teamLabel(career, playoffRun.series[playoffRun.seriesIndex]!.higherSeed)} ${playoffRun.series[playoffRun.seriesIndex]!.higherWins}–${playoffRun.series[playoffRun.seriesIndex]!.lowerWins} ${teamLabel(career, playoffRun.series[playoffRun.seriesIndex]!.lowerSeed)}`
                : ''}
            </p>
          ) : null}
          {next ? (
            <p>
              Next: <strong>{teamLabel(career, next.awayId)}</strong> at{' '}
              <strong>{teamLabel(career, next.homeId)}</strong>{' '}
              <span className="muted">· game {next.number}</span>
            </p>
          ) : null}
          {results.length > 0 ? (
            <div className="result-row" aria-label="Recent results">
              {results.map((r, i) => (
                <span key={`${r.opponentId}-${i}`} className={r.won ? 'result win' : 'result loss'}>
                  {r.won ? 'W' : 'L'} {r.home ? 'vs' : '@'} {teamLabel(career, r.opponentId)}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <section className="panel" aria-label="Your player">
          {header ? (
            <>
              <div className="panel-head">
                <h3>{header.name}</h3>
                <span className="pill accent">OVR {header.overall}</span>
              </div>
              <p className="muted">
                {header.position} · {teamLabel(career, userTeamId)} · Age {header.age}
              </p>
              <p>Role: {header.role ? ROLE_LABELS[header.role] : 'Unassigned'}</p>
              <Meters header={header} />
            </>
          ) : (
            <>
              <h3>No player yet</h3>
              <p className="muted">Pick or create the player you control.</p>
              <button type="button" className="secondary" onClick={() => onNavigate('mycareer')}>
                Choose your player
              </button>
            </>
          )}
        </section>
      </div>

      {offseason ? (
        <section className="panel" aria-label="Offseason summary">
          <div className="panel-head">
            <h3>Offseason {offseason.season}</h3>
            <span className="pill">{offseason.retired} retirements</span>
          </div>
          <p className="muted">
            Your roster: {offseason.rosterCount} players (floor {offseason.rosterFloor}, cap{' '}
            {offseason.rosterCap}) · average mood {offseason.averageMood}
          </p>
        </section>
      ) : null}

      {objectives.length > 0 ? (
        <section className="panel" aria-label="Coach objectives">
          <h3>Coach objectives</h3>
          <ul className="chip-list">
            {objectives.map((o) => (
              <li key={o.id} className="chip">
                {o.label} · target {o.target}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {standings ? (
        <section className="panel" aria-label="Standings snapshot">
          <div className="panel-head">
            <h3>Standings</h3>
            <button type="button" className="link" onClick={() => onNavigate('league')}>
              Full league & playoffs
            </button>
          </div>
          <div className="grid-2">
            {(['East', 'West'] as const).map((conf) => {
              const rows = standings.filter((r) => r.conference === conf).slice(0, 6);
              return (
                <table key={conf} className="stat-table">
                  <caption>{conf}ern Conference</caption>
                  <thead>
                    <tr>
                      <th scope="col">Team</th>
                      <th scope="col" className="num">W</th>
                      <th scope="col" className="num">L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.teamId} aria-current={r.teamId === userTeamId ? 'true' : undefined}>
                        <th scope="row">{teamLabel(career, r.teamId)}</th>
                        <td className="num">{r.wins}</td>
                        <td className="num">{r.losses}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })}
          </div>
        </section>
      ) : null}

      {recentGames.length > 0 ? (
        <section className="panel" aria-label="Recent games">
          <h3>Recent games</h3>
          <ul className="game-list">
            {recentGames.map((g) => {
              const userHome = g.homeId === userTeamId;
              return (
                <li key={String(g.gameId)}>
                  <button type="button" className="ghost game-row" onClick={() => setOpenGame(String(g.gameId))}>
                    <span>{teamLabel(career, g.awayId)}</span>
                    <span className="muted">at</span>
                    <span>{teamLabel(career, g.homeId)}</span>
                    <span className="muted">{userHome ? 'home' : 'away'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {record$ ? (
            <BoxScorePanel
              record={record$}
              rosterByTeam={rosterByTeam}
              onClose={() => setOpenGame(null)}
              nameOf={(id) => playerName(career, id)}
              teamNameOf={(id) => teamLabel(career, id)}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Meters({ header }: { header: ReturnType<typeof selectHeader> }) {
  const meters = [
    { label: 'Coach trust', value: header.coachTrust },
    { label: 'Happiness', value: header.happiness },
    { label: 'Ambition', value: header.ambition },
  ];
  return (
    <div className="meter-list">
      {meters.map((m) => (
        <div key={m.label} className="meter">
          <span>{m.label}</span>
          {m.value === null ? (
            <span className="muted">not tracked</span>
          ) : (
            <>
              <meter min={0} max={100} value={m.value} aria-valuetext={`${m.value} of 100`} />
              <span className="num">{m.value}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function deriveRoleFor(roster: { id: string; overall: number }[], playerId: string) {
  const rank = roster.findIndex((p) => p.id === playerId) + 1;
  if (rank <= 0) return null;
  const overall = roster[rank - 1]?.overall ?? 0;
  return deriveRole({ rosterRank: rank, overall, isStarter: rank <= 5 });
}

function playoffRoundLabel(round: string): string {
  if (round === 'play_in') return 'Play-In';
  if (round === 'round_1') return 'Round 1';
  if (round === 'semifinals') return 'Conference semis';
  if (round === 'conference_finals') return 'Conference finals';
  if (round === 'finals') return 'NBA Finals';
  return round;
}
