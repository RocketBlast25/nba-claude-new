// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { createElement } from 'react';
import { useGameStore, drawUserMoments } from '../../../src/store/gameStore';
import { App } from '../../../src/ui/App';
import { SavesPanel } from '../../../src/ui/SavesPanel';
import { KeyMomentOverlay } from '../../../src/ui/KeyMomentOverlay';
import { HomePanel } from '../../../src/ui/HomePanel';
import { LeaguePanel } from '../../../src/ui/LeaguePanel';
import { TABS, snapshotOf, nextAction } from '../../../src/ui/careerViewModel';
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

function currentSnapshot() {
  const s = useGameStore.getState();
  return snapshotOf({
    career: s.career,
    phase: s.phase,
    season: s.season,
    playoffs: s.playoffs,
    seasonRun: s.seasonRun,
    playoffsRun: s.playoffsRun,
    leagueTeams: s.leagueTeams,
  });
}

describe('career UI', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the new career setup when no career exists', async () => {
    render(createElement(App));
    expect(await screen.findByRole('region', { name: 'New career' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start MyCareer' })).toBeTruthy();
  });

  it('starts a fresh career from the New Career panel', async () => {
    render(createElement(App));
    fireEvent.change(await screen.findByLabelText('Player name'), { target: { value: 'Rip Hamilton' } });
    fireEvent.change(screen.getByLabelText('Starting team'), { target: { value: 'DET' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start MyCareer' }));

    const state = useGameStore.getState();
    expect(state.career?.userTeamId).toBe('DET');
    expect(state.leagueTeams?.length).toBe(30);
  });

  it('uses the five approved tabs and no legacy ones', () => {
    hydrateCareer(7);
    render(createElement(App));
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent?.trim());
    expect(tabs).toEqual(['Home', 'MyCareer', 'League & Playoffs', 'Front Office', 'Saves']);
    expect(TABS.map((t) => t.label)).toEqual(tabs);
    for (const legacy of ['Dashboard', 'GM Desk', 'Draft Room', 'Offseason']) {
      expect(screen.queryByRole('tab', { name: legacy })).toBeNull();
    }
  });

  it('shows exactly one primary action in the HUD, and it is the next step', () => {
    hydrateCareer(7);
    render(createElement(App));
    const hud = screen.getByRole('banner');
    const expected = nextAction(currentSnapshot());
    expect(within(hud).getByRole('button', { name: expected.label })).toBeTruthy();
  });

  it('opens Key Moments as a modal dialog from any tab', () => {
    const league = buildLeague(11);
    const career = careerFrom(league);
    const store = useGameStore.getState();
    store.startCareer({ career, userTeamId: career.userTeamId, seed: 11, leagueTeams: league });
    const player = (career.rosters[career.userTeamId] ?? [])
      .map((id) => career.players.find((p) => p.id === id)!)
      .sort((a, b) => b.overall - a.overall)[0]!;
    expect(store.startPlayerCareer(player.id)).toEqual({ ok: true });
    // Starting the season run stops at the first pending Key Moment.
    store.startSeasonRun(league);

    render(createElement(App));
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getByRole('group', { name: 'Choose an action' })).toBeTruthy();
  });

  it('renders the overlay standalone without pending moments as nothing', () => {
    render(createElement(KeyMomentOverlay));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the saves panel with the active career summary and slot list', () => {
    hydrateCareer(9);
    render(createElement(SavesPanel));
    expect(screen.getByRole('region', { name: 'Active career' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Save slots' })).toBeTruthy();
  });

  it('renders home and league panels without raw team IDs in the standings', () => {
    hydrateCareer(13);
    const snapshot = currentSnapshot();
    const { container: home } = render(createElement(HomePanel, {
      snapshot,
      action: nextAction(snapshot),
      onAction: () => {},
      onNavigate: () => {},
    }));
    expect(home.querySelector('[aria-label="Season at a glance"]')).toBeTruthy();
    cleanup();

    const { container: league } = render(createElement(LeaguePanel, { snapshot }));
    expect(league.querySelector('[aria-label="Standings"]')).toBeTruthy();
  });
});
