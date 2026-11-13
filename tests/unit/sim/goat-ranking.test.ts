import { describe, expect, it, beforeEach } from 'vitest';
import {
  GOAT_LEGENDS,
  legendById,
  type GoatLegend,
} from '../../../src/sim/career/goatCatalog';
import {
  GOAT_TIER_FLOORS,
  GOAT_WEIGHTS,
  computeGoatScore,
  countTrophies,
  formatGoatNumber,
  rankAgainstGoats,
  tierForScore,
  userGoatProfile,
  type GoatProfile,
} from '../../../src/sim/career/goatRanking';
import {
  AWARD_RULES,
  applySeasonAwards,
  createPlayerCareerMode,
  emptyCareerStats,
  selectSeasonAwards,
  type CareerStats,
  type Trophy,
} from '../../../src/sim/career/playerMode';
import type { CareerState } from '../../../src/sim/career/types';
import { COUNTING_STATS, type PlayerSeasonLine } from '../../../src/sim/league/playerSeason';
import { buildSave, parseSave, serializeSave, normalizeCareerStats } from '../../../src/persistence/snapshot';
import { useGameStore } from '../../../src/store/gameStore';
import { NEW_CAREER_TEAMS } from '../../../src/sim/career/newCareer';
import { buildLeague, careerFrom } from '../store/leagueFixture';
import type { Player } from '../../../src/sim/core/models';
import type { PlayerId, TeamId } from '../../../src/sim/core/types';

const ZERO_PROFILE: GoatProfile = {
  name: 'Zero',
  rings: 0,
  finalsMvps: 0,
  mvps: 0,
  allNbaSelections: 0,
  careerPoints: 0,
  careerRebounds: 0,
  careerAssists: 0,
  playoffPoints: 0,
  ppg: 0,
  rpg: 0,
  apg: 0,
};

/** A career state from the shared league fixture, with optional player-mode state. */
function careerWith(overrides: {
  stats?: Partial<CareerStats>;
  trophies?: Trophy[];
  playerMode?: boolean;
}): { career: CareerState; playerId: PlayerId } {
  const league = buildLeague(42);
  const career = careerFrom(league);
  const playerId = (career.rosters[career.userTeamId] ?? [])[0]!;
  if (overrides.playerMode !== false) {
    const player = career.players.find((p) => p.id === playerId) as Player;
    career.playerMode = {
      ...createPlayerCareerMode(player),
      lifetimeEarnings: 0,
      activeObjectives: [],
      pendingOffers: [],
      unhappySeasons: 0,
      careerStats: { ...emptyCareerStats(), ...overrides.stats },
      trophies: overrides.trophies ?? [],
    };
  }
  return { career, playerId };
}

function trophy(kind: Trophy['kind'], season: number, teamId: TeamId): Trophy {
  return { kind, season, teamId };
}

function seasonLine(
  playerId: string,
  averages: Partial<Record<(typeof COUNTING_STATS)[number], number>>,
  gamesPlayed = 82,
): PlayerSeasonLine {
  const zeros = Object.fromEntries(COUNTING_STATS.map((k) => [k, 0])) as Record<
    (typeof COUNTING_STATS)[number],
    number
  >;
  const avgs = { ...zeros, ...averages };
  const totals = Object.fromEntries(
    COUNTING_STATS.map((k) => [k, avgs[k] * gamesPlayed]),
  ) as Record<(typeof COUNTING_STATS)[number], number>;
  return { playerId: playerId as PlayerId, gamesPlayed, totals, averages: avgs };
}

describe('all-time legends catalog', () => {
  it('holds 20 unique legends, each with a complete entry', () => {
    expect(GOAT_LEGENDS.length).toBe(20);
    expect(new Set(GOAT_LEGENDS.map((l) => l.id)).size).toBe(20);
    expect(new Set(GOAT_LEGENDS.map((l) => l.name)).size).toBe(20);
    const positions = new Set(['PG', 'SG', 'SF', 'PF', 'C']);
    for (const legend of GOAT_LEGENDS) {
      expect(legend.id).toMatch(/^[a-z0-9-]+$/);
      expect(legend.name.length).toBeGreaterThan(3);
      expect(legend.era).toMatch(/^\d{4}-\d{4}$/);
      expect(positions.has(legend.position)).toBe(true);
      expect(legend.rings).toBeGreaterThanOrEqual(0);
      expect(legend.mvps).toBeGreaterThanOrEqual(0);
      expect(legend.finalsMvps).toBeGreaterThanOrEqual(0);
      expect(legend.allNbaSelections).toBeGreaterThan(0);
      expect(legend.careerPoints).toBeGreaterThan(10000);
      expect(legend.careerRebounds).toBeGreaterThan(0);
      expect(legend.careerAssists).toBeGreaterThan(0);
      expect(legend.ppg).toBeGreaterThan(10);
      expect(legend.rpg).toBeGreaterThan(0);
      expect(legend.apg).toBeGreaterThan(0);
      expect(legend.signatureAccolade.length).toBeGreaterThan(20);
    }
  });

  it('includes the twenty curated names and looks them up by id', () => {
    const names = GOAT_LEGENDS.map((l: GoatLegend) => l.name);
    for (const expected of [
      'Michael Jordan',
      'LeBron James',
      'Kareem Abdul-Jabbar',
      'Bill Russell',
      'Magic Johnson',
      'Larry Bird',
      'Kobe Bryant',
      'Tim Duncan',
      "Shaquille O'Neal",
      'Stephen Curry',
      'Wilt Chamberlain',
      'Hakeem Olajuwon',
      'Kevin Durant',
      'Giannis Antetokounmpo',
      'Nikola Jokic',
      'Oscar Robertson',
      'Jerry West',
      'Dirk Nowitzki',
      'Karl Malone',
      'Julius Erving',
    ]) {
      expect(names).toContain(expected);
    }
    expect(legendById('michael-jordan')?.name).toBe('Michael Jordan');
    expect(legendById('nobody')).toBeUndefined();
  });
});

describe('GOAT score', () => {
  it('scores an empty profile at zero and is deterministic', () => {
    expect(computeGoatScore(ZERO_PROFILE)).toBe(0);
    const profile = { ...ZERO_PROFILE, rings: 3, mvps: 2, careerPoints: 22000 };
    expect(computeGoatScore(profile)).toBe(computeGoatScore(profile));
  });

  it('applies each exported weight exactly once', () => {
    expect(computeGoatScore({ ...ZERO_PROFILE, rings: 1 })).toBe(GOAT_WEIGHTS.rings);
    expect(computeGoatScore({ ...ZERO_PROFILE, finalsMvps: 1 })).toBe(GOAT_WEIGHTS.finalsMvps);
    expect(computeGoatScore({ ...ZERO_PROFILE, mvps: 1 })).toBe(GOAT_WEIGHTS.mvps);
    expect(computeGoatScore({ ...ZERO_PROFILE, allNbaSelections: 1 })).toBe(
      GOAT_WEIGHTS.allNbaSelections,
    );
    expect(computeGoatScore({ ...ZERO_PROFILE, careerPoints: 1000 })).toBe(
      GOAT_WEIGHTS.pointsPerThousand,
    );
    expect(computeGoatScore({ ...ZERO_PROFILE, careerRebounds: 1000 })).toBe(
      GOAT_WEIGHTS.reboundsPerThousand,
    );
    expect(computeGoatScore({ ...ZERO_PROFILE, careerAssists: 1000 })).toBe(
      GOAT_WEIGHTS.assistsPerThousand,
    );
    expect(computeGoatScore({ ...ZERO_PROFILE, playoffPoints: 1000 })).toBe(
      GOAT_WEIGHTS.playoffPointsPerThousand,
    );
    expect(computeGoatScore({ ...ZERO_PROFILE, ppg: 1 })).toBe(GOAT_WEIGHTS.ppg);
    expect(computeGoatScore({ ...ZERO_PROFILE, rpg: 1 })).toBe(GOAT_WEIGHTS.rpg);
    expect(computeGoatScore({ ...ZERO_PROFILE, apg: 1 })).toBe(GOAT_WEIGHTS.apg);
  });

  it('sums hardware, volume and per-game dominance in one rounded number', () => {
    const profile: GoatProfile = {
      name: 'Test',
      rings: 3,
      finalsMvps: 2,
      mvps: 2,
      allNbaSelections: 6,
      careerPoints: 22000,
      careerRebounds: 6000,
      careerAssists: 5000,
      playoffPoints: 2500,
      ppg: 26,
      rpg: 7,
      apg: 6,
    };
    const expected =
      3 * GOAT_WEIGHTS.rings +
      2 * GOAT_WEIGHTS.finalsMvps +
      2 * GOAT_WEIGHTS.mvps +
      6 * GOAT_WEIGHTS.allNbaSelections +
      22 * GOAT_WEIGHTS.pointsPerThousand +
      6 * GOAT_WEIGHTS.reboundsPerThousand +
      5 * GOAT_WEIGHTS.assistsPerThousand +
      2.5 * GOAT_WEIGHTS.playoffPointsPerThousand +
      26 * GOAT_WEIGHTS.ppg +
      7 * GOAT_WEIGHTS.rpg +
      6 * GOAT_WEIGHTS.apg;
    expect(computeGoatScore(profile)).toBe(Math.round(expected * 10) / 10);
  });

  it('maps scores onto the five tiers at their floors', () => {
    expect(tierForScore(0)).toBe('All-Star Legacy');
    for (const [tier, floor] of Object.entries(GOAT_TIER_FLOORS)) {
      expect(tierForScore(floor)).toBe(tier);
      expect(tierForScore(floor - 0.1)).not.toBe(tier);
    }
  });
});

describe('career awards', () => {
  it('gives MVP and All-NBA to the best impact score and DPOY to the best defender', () => {
    const teamA = 'T00' as TeamId;
    const teamB = 'T01' as TeamId;
    const lines = [
      seasonLine('scorer', { points: 31, rebounds: 6, assists: 5, steals: 1.2, blocks: 0.4 }),
      seasonLine('playmaker', { points: 19, rebounds: 5, assists: 11, steals: 1.4, blocks: 0.2 }),
      seasonLine('anchor', { points: 14, rebounds: 12, assists: 2, steals: 2.4, blocks: 3.1 }),
      seasonLine('glue', { points: 12, rebounds: 7, assists: 4, steals: 1, blocks: 1 }),
      seasonLine('wing', { points: 17, rebounds: 6, assists: 4, steals: 1.1, blocks: 0.8 }),
      seasonLine('bench', { points: 8, rebounds: 4, assists: 3, steals: 0.6, blocks: 0.3 }, 30),
    ];
    const teamByPlayer = new Map<PlayerId, TeamId>([
      ['scorer' as PlayerId, teamA],
      ['playmaker' as PlayerId, teamA],
      ['anchor' as PlayerId, teamB],
      ['glue' as PlayerId, teamB],
      ['wing' as PlayerId, teamA],
      ['bench' as PlayerId, teamB],
    ]);
    const standings = [
      { teamId: teamA, conference: 'East' as const, wins: 60, losses: 22 },
      { teamId: teamB, conference: 'West' as const, wins: 30, losses: 52 },
    ];
    const awards = selectSeasonAwards(lines, teamByPlayer, standings);
    expect(awards.mvp).toBe('scorer');
    expect(awards.dpoy).toBe('anchor');
    expect(awards.allNba[0]).toBe('scorer');
    expect(awards.allNba).toContain('anchor');
    // Players under the games floor only qualify when too few others do.
    expect(awards.allNba).not.toContain('bench');
    expect(awards.allNba.length).toBeLessThanOrEqual(AWARD_RULES.allNbaSize);
  });

  it('records a trophy only for awards the controlled player won', () => {
    const teamId = 'T00' as TeamId;
    const playerId = 'p1' as PlayerId;
    const base = {
      ...createPlayerCareerMode({ id: playerId, name: 'P', overall: 80 } as Player),
      season: 3,
      teamId,
      playerId,
    };
    const won = applySeasonAwards(base, {
      season: 3,
      teamId,
      playerId,
      awards: { mvp: playerId, dpoy: null, allNba: [playerId] },
    });
    const kinds = won.trophies.map((t) => t.kind);
    expect(kinds).toEqual(['mvp', 'all_league']);
    expect(won.trophies.every((t) => t.season === 3 && t.teamId === teamId)).toBe(true);

    const lost = applySeasonAwards(base, {
      season: 3,
      teamId,
      playerId,
      awards: { mvp: 'other' as PlayerId, dpoy: 'other' as PlayerId, allNba: ['other' as PlayerId] },
    });
    expect(lost.trophies).toEqual([]);
  });

  it('counts trophies by kind', () => {
    const counts = countTrophies([
      trophy('championship', 1, 'T00' as TeamId),
      trophy('championship', 2, 'T00' as TeamId),
      trophy('mvp', 2, 'T00' as TeamId),
      trophy('all_league', 2, 'T00' as TeamId),
    ]);
    expect(counts.championship).toBe(2);
    expect(counts.mvp).toBe(1);
    expect(counts.all_league).toBe(1);
    expect(counts.finals_mvp).toBe(0);
  });
});

describe('rank against the goats', () => {
  it('places a rookie last, with a hint naming the next name up', () => {
    const { career, playerId } = careerWith({ playerMode: false });
    const board = rankAgainstGoats(career, playerId);
    expect(board.length).toBe(21);
    const user = board.find((e) => e.isUser)!;
    expect(user.rank).toBe(21);
    expect(user.goatScore).toBe(0);
    expect(user.tier).toBe('All-Star Legacy');
    expect(user.name).toBe(career.players.find((p) => p.id === playerId)!.name);
    expect(user.nextMilestoneHint).toMatch(
      /^Win \d+ more rings? or score [\d,]+ pts to pass .+ \(#20\)$/,
    );
    expect(board.filter((e) => e.isUser).length).toBe(1);
    expect(board.map((e) => e.rank)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    expect(board[20]!.isUser).toBe(true);
  });

  it('moves a multi-MVP champion into the all-time top ten', () => {
    const trophies: Trophy[] = [
      trophy('championship', 2, 'T00' as TeamId),
      trophy('championship', 5, 'T00' as TeamId),
      trophy('championship', 9, 'T00' as TeamId),
      trophy('championship', 12, 'T00' as TeamId),
      trophy('finals_mvp', 2, 'T00' as TeamId),
      trophy('finals_mvp', 5, 'T00' as TeamId),
      trophy('finals_mvp', 9, 'T00' as TeamId),
      trophy('mvp', 3, 'T00' as TeamId),
      trophy('mvp', 6, 'T00' as TeamId),
      trophy('mvp', 10, 'T00' as TeamId),
      ...Array.from({ length: 8 }, (_, i) => trophy('all_league', i + 1, 'T00' as TeamId)),
    ];
    const { career, playerId } = careerWith({
      trophies,
      stats: {
        gamesPlayed: 1000,
        points: 26000,
        rebounds: 7000,
        assists: 6000,
        steals: 1200,
        blocks: 500,
        playoffGames: 160,
        playoffPoints: 3000,
        finalsAppearances: 4,
      },
    });

    const board = rankAgainstGoats(career, playerId);
    const user = board.find((e) => e.isUser)!;
    expect(user.rank).toBeLessThanOrEqual(10);
    expect(['GOAT Contender', 'Mount Rushmore']).toContain(user.tier);
    expect(user.goatScore).toBeGreaterThan(9000);
    // The score matches the profile the career state produces.
    expect(user.goatScore).toBe(computeGoatScore(userGoatProfile(career, playerId)));
    expect(userGoatProfile(career, playerId).ppg).toBeCloseTo(26000 / 1000, 6);

    const profile = userGoatProfile(career, playerId);
    expect(profile.rings).toBe(4);
    expect(profile.mvps).toBe(3);
    expect(profile.finalsMvps).toBe(3);
    expect(profile.allNbaSelections).toBe(8);
  });

  it('sorts deterministically and keeps legends in catalog order on ties', () => {
    const { career, playerId } = careerWith({ playerMode: false });
    const first = rankAgainstGoats(career, playerId);
    const second = rankAgainstGoats(career, playerId);
    expect(second).toEqual(first);
    const legends = first.filter((e) => !e.isUser);
    for (let i = 0; i < legends.length; i++) {
      expect(legends[i]!.legendId).toBeTruthy();
      expect(legends[i]!.nextMilestoneHint).toBeNull();
      if (i > 0) expect(legends[i]!.goatScore).toBeLessThanOrEqual(legends[i - 1]!.goatScore);
    }
  });

  it('crowns a player who passes every legend', () => {
    const trophies: Trophy[] = [
      ...Array.from({ length: 12 }, (_, i) => trophy('championship', i + 1, 'T00' as TeamId)),
      ...Array.from({ length: 12 }, (_, i) => trophy('mvp', i + 1, 'T00' as TeamId)),
      ...Array.from({ length: 12 }, (_, i) => trophy('finals_mvp', i + 1, 'T00' as TeamId)),
    ];
    const { career, playerId } = careerWith({
      trophies,
      stats: { gamesPlayed: 1000, points: 40000, rebounds: 12000, assists: 12000, playoffPoints: 8000 },
    });
    const board = rankAgainstGoats(career, playerId);
    const user = board.find((e) => e.isUser)!;
    expect(user.rank).toBe(1);
    expect(user.tier).toBe('GOAT Contender');
    expect(user.nextMilestoneHint).toBe('You are the GOAT: there is no one left to pass.');
  });

  it('formats large numbers without a locale', () => {
    expect(formatGoatNumber(1420)).toBe('1,420');
    expect(formatGoatNumber(999)).toBe('999');
    expect(formatGoatNumber(1234567)).toBe('1,234,567');
  });
});

describe('save compatibility for cumulative stats', () => {
  it('upgrades a player-mode save that predates careerStats', () => {
    const { career } = careerWith({});
    const legacyMode = { ...career.playerMode! } as Record<string, unknown>;
    delete legacyMode.careerStats;
    const legacyCareer = { ...career, playerMode: legacyMode } as unknown as CareerState;
    const text = serializeSave(
      buildSave({
        career: legacyCareer,
        phase: 'regular_season',
        userTeamId: career.userTeamId,
        seed: 42,
        season: null,
        playoffs: null,
        draftOrder: [],
        leagueTeams: null,
        pendingMoments: [],
        resolvedMoments: [],
      }),
    );

    const parsed = parseSave(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.payload.career?.playerMode?.careerStats).toEqual(emptyCareerStats());
  });

  it('keeps the stats a newer save recorded and zeroes only missing fields', () => {
    const { career } = careerWith({
      stats: { gamesPlayed: 82, points: 1800, rebounds: 400, assists: 350 },
    });
    expect(normalizeCareerStats(career.playerMode!.careerStats)).toEqual(career.playerMode!.careerStats);
    expect(normalizeCareerStats({ points: 500, gamesPlayed: 10 })).toEqual({
      ...emptyCareerStats(),
      points: 500,
      gamesPlayed: 10,
    });
    expect(normalizeCareerStats(undefined)).toEqual(emptyCareerStats());
    expect(normalizeCareerStats({ points: 'lots' })).toEqual(emptyCareerStats());
  });

  it('loads a legacy career that has no player mode at all', () => {
    const { career } = careerWith({ playerMode: false });
    const text = serializeSave(
      buildSave({
        career,
        phase: 'regular_season',
        userTeamId: career.userTeamId,
        seed: 42,
        season: null,
        playoffs: null,
        draftOrder: [],
        leagueTeams: null,
        pendingMoments: [],
        resolvedMoments: [],
      }),
    );
    const parsed = parseSave(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.payload.career?.playerMode).toBeUndefined();
  });
});

describe('cumulative career stats through the store', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('accumulates a completed regular season and playoff run into careerStats', () => {
    const started = useGameStore.getState().startNewCareer({
      seed: 11,
      userTeamId: NEW_CAREER_TEAMS.find((t) => t.id === 'DEN')!.id,
      playerName: 'Ace Carter',
      position: 'SG',
      archetype: 'sharpshooter',
    });
    expect(started.ok).toBe(true);
    expect(useGameStore.getState().career?.playerMode?.careerStats).toEqual(emptyCareerStats());

    const league = useGameStore.getState().leagueTeams!;
    let season = useGameStore.getState().startSeasonRun(league);
    for (let i = 0; i < 500 && season.status !== 'finished'; i++) {
      season = season.status === 'pending'
        ? useGameStore.getState().resolveSeasonMoment({ success: true, reward: 0 })!
        : useGameStore.getState().advanceSeasonRun()!;
    }
    expect(season.status).toBe('finished');

    const afterSeason = useGameStore.getState();
    const playerId = afterSeason.career!.playerMode!.playerId;
    const stats = afterSeason.career!.playerMode!.careerStats;
    const seasonLines = afterSeason.season!.gameBoxScores
      .flatMap((g) => g.lines)
      .filter((l) => l.playerId === playerId);
    expect(seasonLines.length).toBe(82);
    expect(stats.gamesPlayed).toBe(82);
    expect(stats.points).toBe(seasonLines.reduce((s, l) => s + l.points, 0));
    expect(stats.rebounds).toBe(seasonLines.reduce((s, l) => s + l.rebounds, 0));
    expect(stats.assists).toBe(seasonLines.reduce((s, l) => s + l.assists, 0));
    expect(stats.playoffGames).toBe(0);

    let playoffs = useGameStore.getState().startPlayoffsRun(league);
    for (let i = 0; i < 500 && playoffs.status !== 'finished'; i++) {
      playoffs = playoffs.status === 'pending'
        ? useGameStore.getState().resolvePlayoffMoment({ success: true, reward: 0 })!
        : useGameStore.getState().advancePlayoffsRun()!;
    }
    expect(playoffs.status).toBe('finished');

    const afterPlayoffs = useGameStore.getState();
    const finalStats = afterPlayoffs.career!.playerMode!.careerStats;
    const playoffLines = (afterPlayoffs.playoffsRun?.boxScores ?? []).filter(
      (l) => l.playerId === playerId,
    );
    expect(finalStats.playoffGames).toBe(playoffLines.length);
    expect(finalStats.playoffPoints).toBe(playoffLines.reduce((s, l) => s + l.points, 0));
    expect(finalStats.gamesPlayed).toBe(82);
    expect(finalStats.points).toBe(stats.points);
    const reachedFinals =
      afterPlayoffs.playoffs!.champion === afterPlayoffs.career!.userTeamId ||
      afterPlayoffs.playoffs!.runnerUp === afterPlayoffs.career!.userTeamId;
    expect(finalStats.finalsAppearances).toBe(reachedFinals ? 1 : 0);
    // Re-advancing a finished run must not score the season twice.
    if (afterPlayoffs.playoffsRun) {
      const again = useGameStore.getState().advancePlayoffsRun();
      expect(again).not.toBeNull();
      expect(useGameStore.getState().career!.playerMode!.careerStats.playoffGames).toBe(
        finalStats.playoffGames,
      );
    }
  });
});
