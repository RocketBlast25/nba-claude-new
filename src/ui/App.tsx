import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useGameStore } from '../store/gameStore';
import { CareerDashboard } from './CareerDashboard';
import { PlayoffBracket } from './PlayoffBracket';
import { OffseasonHub } from './OffseasonHub';
import { DraftRoom } from './DraftRoom';
import { RotationEditor, TradeBuilder, FreeAgencyPanel } from './GmDesk';
import { SavesPanel } from './SavesPanel';
import { MyCareerDashboard } from './MyCareerDashboard';
import { NewCareerPanel } from './NewCareerPanel';

/** Tab order is the display order. Each id maps to one panel below. */
const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'mycareer', label: 'MyCareer' },
  { id: 'gm', label: 'GM Desk' },
  { id: 'playoffs', label: 'Playoffs' },
  { id: 'draft', label: 'Draft Room' },
  { id: 'offseason', label: 'Offseason' },
  { id: 'saves', label: 'Saves' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** GM Desk sub-sections, shown inside the GM Desk tab. */
const GM_SECTIONS = ['Rotation', 'Trades', 'Free Agency'] as const;
type GmSection = (typeof GM_SECTIONS)[number];

/**
 * Root shell. Screens read from the Zustand store; no sim logic lives here.
 * With no career loaded the New Career setup replaces the tabs; once a career
 * exists the header's New Career button brings the setup back.
 * Tabs follow the WAI-ARIA tablist pattern: arrow keys move focus, Home and End jump
 * to the ends, and the active tab is the only one in the tab order.
 */
export function App() {
  const career = useGameStore((s) => s.career);
  const phase = useGameStore((s) => s.phase);
  const reset = useGameStore((s) => s.reset);
  const [active, setActive] = useState<TabId>('dashboard');
  const [creating, setCreating] = useState(false);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const showSetup = !career || creating;

  const focusTab = (index: number) => {
    const tab = TABS[(index + TABS.length) % TABS.length];
    if (!tab) return;
    setActive(tab.id);
    tabRefs.current[tab.id]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === 'ArrowRight') focusTab(index + 1);
    else if (e.key === 'ArrowLeft') focusTab(index - 1);
    else if (e.key === 'Home') focusTab(0);
    else if (e.key === 'End') focusTab(TABS.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <main className="app">
      <header className="app-header">
        <h1>NBA Career Simulator</h1>
        {career && !creating ? <p className="phase">Phase: {phase.replace('_', ' ')}</p> : null}
        {career && !creating ? (
          <button type="button" className="new-career" onClick={() => setCreating(true)}>
            New Career
          </button>
        ) : null}
        {creating ? (
          <button type="button" onClick={() => setCreating(false)}>
            Cancel
          </button>
        ) : null}
      </header>
      {showSetup ? (
        <NewCareerPanel onStarted={() => setCreating(false)} />
      ) : (
        <>
          <div role="tablist" aria-label="Career sections" className="tablist">
            {TABS.map((tab, i) => {
              const selected = tab.id === active;
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
                  onKeyDown={(e) => onKeyDown(e, i)}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <TabPanel id="dashboard" active={active}>
            {career ? <CareerDashboard /> : <p>Start a career to begin.</p>}
          </TabPanel>
          <TabPanel id="mycareer" active={active}>
            {career ? <MyCareerDashboard /> : <p>Start a career to begin.</p>}
          </TabPanel>
          <TabPanel id="gm" active={active}>
            {career ? <GmDesk /> : <p>Start a career to begin.</p>}
          </TabPanel>
          <TabPanel id="playoffs" active={active}>
            {career ? <PlayoffBracket /> : <p>Start a career to begin.</p>}
          </TabPanel>
          <TabPanel id="draft" active={active}>
            {career ? <DraftRoom /> : <p>Start a career to begin.</p>}
          </TabPanel>
          <TabPanel id="offseason" active={active}>
            {career ? <OffseasonHub /> : <p>Start a career to begin.</p>}
          </TabPanel>
          <TabPanel id="saves" active={active}>
            <SavesPanel />
          </TabPanel>
          {career ? (
            <button type="button" className="reset" onClick={() => reset()}>
              Reset career
            </button>
          ) : null}
        </>
      )}
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

/** GM Desk: Rotation, Trades and Free Agency as sub-sections. */
function GmDesk() {
  const [section, setSection] = useState<GmSection>('Rotation');
  return (
    <div>
      <div role="group" aria-label="GM Desk sections" className="subtabs">
        {GM_SECTIONS.map((name) => (
          <button key={name} type="button" aria-pressed={section === name} onClick={() => setSection(name)}>
            {name}
          </button>
        ))}
      </div>
      {section === 'Rotation' ? <RotationEditor /> : null}
      {section === 'Trades' ? <TradeBuilder /> : null}
      {section === 'Free Agency' ? <FreeAgencyPanel /> : null}
    </div>
  );
}
