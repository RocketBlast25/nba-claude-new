// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach } from 'vitest';
import { createElement } from 'react';
import { ACTION_RULES, ACTION_IDS, decisionCards } from '../../../src/possession/decision';
import { SeededRng } from '../../../src/sim/core/random';
import { generateAttributes } from '../../../src/sim/league/roster';
import { useGameStore, drawUserMoments } from '../../../src/store/gameStore';
import { KeyMomentCards } from '../../../src/ui/KeyMomentCards';
import { CareerDashboard } from '../../../src/ui/CareerDashboard';
import { PlayoffBracket } from '../../../src/ui/PlayoffBracket';
import { DraftRoom } from '../../../src/ui/DraftRoom';
import { OffseasonHub } from '../../../src/ui/OffseasonHub';
import { App } from '../../../src/ui/App';
import { SavesPanel } from '../../../src/ui/SavesPanel';
import { buildLeague, careerFrom } from '../store/leagueFixture';

/** Runs the real flow: start -> play season -> queue Key Moments -> resolve -> offseason. */
function hydrateCareer(seed: number) {
  const league = buildLeague(seed);
  const career = careerFrom(league);
  const store = useGameStore.getState();
  store.startCareer({ career, userTeamId: career.userTeamId, seed, leagueTeams: league });
  store.playSeason(league);
  store.queueMoments(drawUserMoments(useGameStore.getState().career!, 'g1', 3));
  useGameStore.getState().resolveNextMoment('drive');
  useGameStore.getState().runOffseason();
}

describe('career UI screens', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the empty states before a career starts', () => {
    render(createElement(App));
    expect(screen.getByText('Start a career to begin.')).toBeTruthy();
    cleanup();
    render(createElement(CareerDashboard));
    expect(screen.getByText('No career started.')).toBeTruthy();
    cleanup();
    render(createElement(KeyMomentCards));
    expect(screen.getByText('No Key Moments pending.')).toBeTruthy();
  });

  it('renders the populated dashboard with real standings', () => {
    hydrateCareer(42);
    const { container } = render(createElement(CareerDashboard));
    expect(screen.getByRole('region', { name: 'Standings' })).toBeTruthy();
    expect(container.textContent).toContain('Eastern Conference');
    expect(container.textContent).toContain('Western Conference');
  });

  it('renders the populated playoff bracket with series scores', () => {
    hydrateCareer(42);
    const { container } = render(createElement(PlayoffBracket));
    expect(screen.getByText(/Champion:/)).toBeTruthy();
    expect(screen.getByText('Round 1')).toBeTruthy();
    expect(container.textContent).toMatch(/\d+\s*-\s*\d+/);
  });

  it('renders the draft board with every pick and the offseason hub', () => {
    hydrateCareer(42);
    render(createElement(DraftRoom));
    expect(screen.getByText(/Pick 1:/)).toBeTruthy();
    expect(screen.getByText(/Pick 30:/)).toBeTruthy();
    cleanup();
    render(createElement(OffseasonHub));
    expect(screen.getByText(/Retirements this offseason/)).toBeTruthy();
    expect(screen.getByText(/Your roster/)).toBeTruthy();
  });

  it('renders the pending Key Moment with a button for each action', () => {
    hydrateCareer(42);
    const league = buildLeague(42);
    const career = careerFrom(league);
    useGameStore.getState().queueMoments(drawUserMoments(career, 'g2', 7));
    render(createElement(KeyMomentCards));
    for (const id of ACTION_IDS) {
      expect(screen.getByRole('button', { name: new RegExp(ACTION_RULES[id].name) })).toBeTruthy();
    }
    expect(screen.getAllByText(/%/).length).toBeGreaterThan(0);
  });

  it('renders the court replay for a user Key Moment after the season is played', () => {
    const league = buildLeague(42);
    const career = careerFrom(league);
    const store = useGameStore.getState();
    store.startCareer({ career, userTeamId: career.userTeamId, seed: 42, leagueTeams: league });
    store.playSeason(league);
    const pending = useGameStore.getState().pendingMoments;
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.length).toBeLessThanOrEqual(3);
    expect(pending[0]!.replay?.length).toBe(8);
    render(createElement(KeyMomentCards));
    expect(screen.getByRole('img', { name: /court replay/i })).toBeTruthy();
    expect(screen.getByRole('group', { name: /choose an action/i })).toBeTruthy();
  });

  it('switches tabs on click and keyboard, and shows only the active panel', () => {
    render(createElement(App));
    const tablist = screen.getByRole('tablist', { name: 'Career sections' });
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Dashboard',
      'GM Desk',
      'Playoffs',
      'Draft Room',
      'Offseason',
      'Saves',
    ]);
    expect(tablist).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Dashboard' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByRole('tab', { name: 'Saves' }));
    expect(screen.getByRole('tab', { name: 'Saves' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Saves' })).toBeTruthy();
    expect(document.getElementById('panel-dashboard')?.hidden).toBe(true);
    expect(document.getElementById('panel-saves')?.hidden).toBe(false);

    const saves = screen.getByRole('tab', { name: 'Saves' });
    fireEvent.keyDown(saves, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Dashboard' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Dashboard' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Saves' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Saves' }), { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Dashboard' }).getAttribute('aria-selected')).toBe('true');
  });

  it('lists the three manual slots and autosave, with export and import', () => {
    render(createElement(SavesPanel));
    expect(screen.getByRole('heading', { name: 'Saves' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Manual slot 1' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Manual slot 2' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Manual slot 3' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Autosave' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export JSON' })).toBeTruthy();
    expect(screen.getByLabelText(/Import JSON/)).toBeTruthy();
  });

  it('keeps decisionCards chances in range for generated attributes', () => {
    const chances = decisionCards(generateAttributes(new SeededRng(5), 60));
    for (const id of ACTION_IDS) {
      expect(chances[id]).toBeGreaterThanOrEqual(0);
      expect(chances[id]).toBeLessThanOrEqual(1);
    }
  });
});
