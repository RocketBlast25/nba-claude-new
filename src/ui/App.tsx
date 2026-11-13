import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useGameStore } from '../store/gameStore';
import { NewCareerPanel } from './NewCareerPanel';
import { HomePanel } from './HomePanel';
import { MyCareerPanel } from './MyCareerPanel';
import { LeaguePanel } from './LeaguePanel';
import { FrontOfficePanel } from './FrontOfficePanel';
import { SavesPanel } from './SavesPanel';
import { KeyMomentOverlay } from './KeyMomentOverlay';
import {
  TABS,
  nextAction,
  phaseLabel,
  phaseSteps,
  recordOf,
  seedLabel,
  snapshotOf,
  teamLabel,
  type NextAction,
  type TabId,
} from './careerViewModel';

/**
 * Root shell. It owns the HUD, the five tabs and the single primary action; every
 * panel below is read-only or writes through the store's own actions. The autosave is
 * restored on boot, so a reload drops the player back into their career.
 */
export function App() {
  const career = useGameStore((s) => s.career);
  const phase = useGameStore((s) => s.phase);
  const season = useGameStore((s) => s.season);
  const playoffs = useGameStore((s) => s.playoffs);
  const seasonRun = useGameStore((s) => s.seasonRun);
  const playoffsRun = useGameStore((s) => s.playoffsRun);
  const leagueTeams = useGameStore((s) => s.leagueTeams);
  const autosavedAt = useGameStore((s) => s.autosavedAt);
  const autosaveError = useGameStore((s) => s.autosaveError);
  const startSeasonRun = useGameStore((s) => s.startSeasonRun);
  const advanceSeasonRun = useGameStore((s) => s.advanceSeasonRun);
  const startPlayoffsRun = useGameStore((s) => s.startPlayoffsRun);
  const advancePlayoffsRun = useGameStore((s) => s.advancePlayoffsRun);
  const runOffseason = useGameStore((s) => s.runOffseason);

  const [active, setActive] = useState<TabId>('home');
  const [creating, setCreating] = useState(false);
  const [restored, setRestored] = useState(false);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Boot: restore the autosave once, so a page reload continues the career.
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      if (!useGameStore.getState().career) await useGameStore.getState().loadFromSlot('autosave');
      if (!cancelled) setRestored(true);
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const snapshot = snapshotOf({ career, phase, season, playoffs, seasonRun, playoffsRun, leagueTeams });
  const action = nextAction(snapshot);
  const record = recordOf(snapshot);
  const steps = phaseSteps(snapshot);
  const player = career?.players.find((p) => p.id === career.playerMode?.playerId) ?? null;
  const offers = career?.playerMode?.pendingOffers.length ?? 0;

  const runPrimary = () => {
    switch (action.kind) {
      case 'new-career':
        setCreating(true);
        break;
      case 'pick-player':
        setActive('mycareer');
        break;
      case 'review-offers':
        setActive('frontoffice');
        break;
      case 'start-season':
        if (leagueTeams) startSeasonRun(leagueTeams);
        setActive('home');
        break;
      case 'advance-season':
        advanceSeasonRun();
        break;
      case 'start-playoffs':
        if (leagueTeams) startPlayoffsRun(leagueTeams);
        setActive('league');
        break;
      case 'advance-playoffs':
        advancePlayoffsRun();
        break;
      case 'enter-offseason':
        runOffseason();
        setActive('home');
        break;
      case 'key-moment':
        // The overlay is already open; nothing to advance until it is resolved.
        break;
    }
  };

  const focusTab = (index: number) => {
    const tab = TABS[(index + TABS.length) % TABS.length];
    if (!tab) return;
    setActive(tab.id);
    tabRefs.current[tab.id]?.focus();
  };

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === 'ArrowRight') focusTab(index + 1);
    else if (e.key === 'ArrowLeft') focusTab(index - 1);
    else if (e.key === 'Home') focusTab(0);
    else if (e.key === 'End') focusTab(TABS.length - 1);
    else return;
    e.preventDefault();
  };

  if (!career && !restored) {
    return (
      <main className="app">
        <p className="muted">Loading your career…</p>
      </main>
    );
  }

  if (!career || creating) {
    return (
      <main className="app">
        <header className="brand">
          <h1>NBA Career Simulator</h1>
          {creating ? (
            <button type="button" className="ghost" onClick={() => setCreating(false)}>
              Cancel
            </button>
          ) : null}
        </header>
        <NewCareerPanel onStarted={() => setCreating(false)} />
      </main>
    );
  }

  return (
    <main className="app">
      <header className="hud" aria-label="Career status">
        <div className="hud-identity">
          <span className="avatar" aria-hidden="true">
            {initials(player?.name ?? '')}
          </span>
          <div>
            <p className="eyebrow">NBA Career Simulator</p>
            <strong>{player?.name ?? 'No player selected'}</strong>
            <p className="muted">
              {player ? `${player.position} · Age ${player.age} · OVR ${player.overall}` : 'Pick a player to begin'}
            </p>
            <p className="muted">
              {teamLabel(career, career.userTeamId)} · Season {career.season}
            </p>
          </div>
        </div>

        <div className="hud-phase">
          <p className="eyebrow">{phaseLabel(phase)}</p>
          <ol className="phase-steps" aria-label="Season progress">
            {steps.map((step) => (
              <li key={step.id} className={`step ${step.status}`} aria-current={step.status === 'current' ? 'step' : undefined}>
                {step.label}
              </li>
            ))}
          </ol>
        </div>

        <div className="hud-record">
          <span className="big-stat">{record ? record.label : '—'}</span>
          <span className="muted">{record ? seedLabel(record) || 'No games yet' : 'No games yet'}</span>
        </div>

        <div className="hud-action">
          <button type="button" className="primary" onClick={runPrimary} disabled={!action.enabled}>
            {action.label}
          </button>
          <span className="muted hud-detail">{action.detail}</span>
          {autosaveError ? (
            <span className="saved" role="alert">Autosave failed: storage full</span>
          ) : autosavedAt ? (
            <span className="saved">Autosaved</span>
          ) : null}
        </div>
      </header>

      <div role="tablist" aria-label="Career sections" className="tablist">
        {TABS.map((tab, i) => {
          const selected = tab.id === active;
          const badge = tab.id === 'frontoffice' && offers > 0 ? offers : null;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
            >
              {tab.label}
              {badge !== null ? <span className="tab-badge">{badge}</span> : null}
            </button>
          );
        })}
      </div>

      <TabPanel id="home" active={active}>
        <HomePanel snapshot={snapshot} action={action} onAction={runPrimary} onNavigate={setActive} />
      </TabPanel>
      <TabPanel id="mycareer" active={active}>
        <MyCareerPanel onNavigate={setActive} />
      </TabPanel>
      <TabPanel id="league" active={active}>
        <LeaguePanel snapshot={snapshot} />
      </TabPanel>
      <TabPanel id="frontoffice" active={active}>
        <FrontOfficePanel onNavigate={setActive} />
      </TabPanel>
      <TabPanel id="saves" active={active}>
        <SavesPanel onNewCareer={() => setCreating(true)} />
      </TabPanel>

      <KeyMomentOverlay />
    </main>
  );
}

function TabPanel({ id, active, children }: { id: TabId; active: TabId; children: ReactNode }) {
  const hidden = id !== active;
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={hidden} tabIndex={0}>
      {hidden ? null : children}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return '—';
  const first = parts[0]!.charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : '';
  return `${first}${last}`.toUpperCase();
}

/** Re-exported for tests that assert the shell's action model. */
export type { NextAction };
