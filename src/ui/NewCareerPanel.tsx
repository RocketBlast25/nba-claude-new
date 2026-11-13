import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { NEW_CAREER_TEAMS } from '../sim/career/newCareer';
import { ARCHETYPES, POSITION_OPTIONS, type ArchetypeId } from '../sim/career/customPlayer';
import type { Position } from '../sim/core/models';
import type { TeamId } from '../sim/core/types';

/** Seed used when the field is left blank, so a first career is reproducible. */
export const DEFAULT_NEW_CAREER_SEED = 2026;

/**
 * New Career setup: name, position, archetype, starting team and an optional seed.
 * Generates the league through the store's startNewCareer action and hands control
 * back to the shell, which then shows the active career.
 */
export function NewCareerPanel({ onStarted }: { onStarted?: () => void }) {
  const startNewCareer = useGameStore((s) => s.startNewCareer);
  const [name, setName] = useState('');
  const [position, setPosition] = useState<Position>('SG');
  const [archetype, setArchetype] = useState<ArchetypeId>('all_around');
  const [teamId, setTeamId] = useState<TeamId>(NEW_CAREER_TEAMS[0]!.id);
  const [seedText, setSeedText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const seed = seedText.trim() === '' ? DEFAULT_NEW_CAREER_SEED : Number(seedText);
    if (!Number.isInteger(seed) || seed < 0) {
      setError('Seed must be a whole number.');
      return;
    }
    const result = startNewCareer({ seed, userTeamId: teamId, playerName: name, position, archetype });
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setError(null);
    onStarted?.();
  };

  const chosenArchetype = ARCHETYPES.find((a) => a.id === archetype);

  return (
    <section aria-label="New career" className="card">
      <h2>Start a new career</h2>
      <p>
        Create your rookie, pick a team, and play a full season through the playoffs and
        offseason. The league is generated from the seed, so the same seed replays the same
        league.
      </p>
      <form aria-label="New career setup" onSubmit={submit}>
        <label>
          Player name <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label>
          Position{' '}
          <select value={position} onChange={(e) => setPosition(e.target.value as Position)}>
            {POSITION_OPTIONS.map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
          </select>
        </label>
        <label>
          Archetype{' '}
          <select value={archetype} onChange={(e) => setArchetype(e.target.value as ArchetypeId)}>
            {ARCHETYPES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Starting team{' '}
          <select value={teamId} onChange={(e) => setTeamId(e.target.value as TeamId)}>
            {NEW_CAREER_TEAMS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.city} {t.name} ({t.conference})
              </option>
            ))}
          </select>
        </label>
        <label>
          Seed (optional){' '}
          <input
            value={seedText}
            onChange={(e) => setSeedText(e.target.value)}
            placeholder={String(DEFAULT_NEW_CAREER_SEED)}
            inputMode="numeric"
          />
        </label>
        <button type="submit">Start MyCareer</button>
        {error ? <p role="alert">{error}</p> : null}
      </form>
      {chosenArchetype ? <p className="hint">{chosenArchetype.description}</p> : null}
    </section>
  );
}
