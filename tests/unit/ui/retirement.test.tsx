// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { createElement } from 'react';
import { useGameStore, setHallOfFameStorage } from '../../../src/store/gameStore';
import { memoryHallOfFameStorage } from '../../../src/persistence/hallOfFameStore';
import { RetirementCeremony } from '../../../src/ui/RetirementCeremony';
import { buildLeague, careerFrom } from '../store/leagueFixture';

function startPlayerCareer() {
  const league = buildLeague(11);
  const career = careerFrom(league);
  const store = useGameStore.getState();
  store.startCareer({ career, userTeamId: career.userTeamId, seed: 11, leagueTeams: league });
  const roster = (career.rosters[career.userTeamId] ?? [])
    .map((id) => career.players.find((p) => p.id === id)!)
    .sort((a, b) => b.overall - a.overall);
  const result = useGameStore.getState().startPlayerCareer(roster[0]!.id);
  if (!result.ok) throw new Error(result.reason);
}

describe('retirement UI', () => {
  beforeEach(() => {
    setHallOfFameStorage(memoryHallOfFameStorage());
    useGameStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows nothing without an active player career', () => {
    const { container } = render(createElement(RetirementCeremony));
    expect(container.textContent).toBe('');
  });

  it('retires into an induction summary and lists the player in the trophy room', async () => {
    startPlayerCareer();
    render(createElement(RetirementCeremony));

    fireEvent.click(screen.getByRole('button', { name: 'Retire & Enter Hall of Fame' }));

    const dialog = await screen.findByRole('dialog', { name: 'Hall of Fame induction' });
    expect(within(dialog).getByText(/All-time GOAT rank #/)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Enter the trophy room' }));

    const room = await screen.findByRole('region', { name: 'Hall of Fame' });
    expect(within(room).getAllByRole('listitem').length).toBe(1);
    expect(useGameStore.getState().career!.careers.some((c) => c.retired)).toBe(true);
  });
});
