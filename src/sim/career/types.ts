import type { Attributes, Player, Team } from '../core/models';
import type { TeamId } from '../core/types';
import type { PlayerCareerMode } from './playerMode';
import type { SeasonObjective } from './keyMomentTriggers';
import type { PlayerOffer } from './freeAgency';

/** Off-court event kinds. Effects are in CAREER_CONFIG.offCourt. */
export type OffCourtKind = 'media' | 'injury_rumor' | 'community' | 'contract_talk' | 'teammate_conflict';

export interface OffCourtEvent {
  id: string;
  kind: OffCourtKind;
  playerId: Player['id'];
  season: number;
  /** Signed effect applied to mood (and chemistry where relevant). */
  moodDelta: number;
  chemistryDelta: number;
}

/** Per-player career state that persists across seasons. */
export interface PlayerCareer {
  playerId: Player['id'];
  /** Last season's yearly attribute snapshot is kept on the Player; this tracks career facts. */
  yearsPro: number;
  /** 0 to 100. */
  mood: number;
  /** 0 to 100. */
  chemistry: number;
  /** Consecutive offseasons spent unsigned in free agency. */
  unsignedOffseasons: number;
  retired: boolean;
  /** Season index the player retired in, if retired. */
  retiredSeason: number | null;
}

/** One selected decision point in a game the user or AI plays. */
export interface KeyMoment {
  gameId: string;
  season: number;
  quarter: 1 | 2 | 3 | 4;
  clockSec: number;
  /** Whether the user's team controls this moment. */
  userControlled: boolean;
  actorId: Player['id'];
  attributes: Attributes;
  /** Court frames for replay. Only set on user-controlled moments (Milestone 7, Phase B). */
  replay?: import('../../possession/replay').CourtSnapshot[];
}

export interface KeyMomentResult {
  moment: KeyMoment;
  actionId: string;
  success: boolean;
  reward: number;
}

export interface CareerState {
  season: number;
  userTeamId: TeamId;
  players: Player[];
  /** Normalized team-to-player mapping; each player id appears on at most one roster. */
  rosters: Record<TeamId, Player['id'][]>;
  careers: PlayerCareer[];
  events: OffCourtEvent[];
  /** Ordered rotation per team (Milestone 7, Phase C). Absent on older saves. */
  rotations?: Record<TeamId, Player['id'][]>;
  /** Team metadata (market size, payroll). Absent on older saves. */
  teams?: Team[];
  /** User-controlled player's mode state. Absent on Phase 1 to 4 saves. */
  playerMode?: PlayerModeState;
}

/** Serializable player-mode slice of CareerState (Milestone 8, Phase 5). */
export interface PlayerModeState extends PlayerCareerMode {
  /** Previous season's attributes for year-over-year deltas. */
  previousAttributes?: Attributes;
  lifetimeEarnings: number;
  activeObjectives: SeasonObjective[];
  /** Offers awaiting the user's signing decision in the offseason. */
  pendingOffers: PlayerOffer[];
  unhappySeasons: number;
}
