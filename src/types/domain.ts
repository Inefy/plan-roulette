// src/types/domain.ts
export type RoomStatus =
  | 'draft'
  | 'inviting'
  | 'voting'
  | 'deciding'
  | 'decided'
  | 'itinerary_ready'
  | 'completed'
  | 'cancelled'
  | 'expired';

export type DecisionMode = 'consensus' | 'majority' | 'host_pick';

export type VoteValue = 'yes' | 'maybe' | 'skip' | 'no';

export type PlanCategory =
  | 'food'
  | 'bars'
  | 'coffee'
  | 'hike'
  | 'walk'
  | 'movie'
  | 'study'
  | 'event-ish'
  | 'cheap'
  | 'rainy_day'
  | 'at_home'
  | 'game_night'
  | 'shopping'
  | 'date_idea'
  | 'wildcard';

export type BudgetTier = 'free' | 'low' | 'moderate' | 'high' | 'splurge';

export type EnergyLevel = 'low' | 'medium' | 'high';

export type LocationMode = 'in_person' | 'remote' | 'hybrid';

export type WeatherMode = 'indoor' | 'outdoor' | 'weather_flexible';

export type PlanningEffort = 'instant' | 'light' | 'coordinated';

export type ParticipantRole = 'host' | 'guest';

export type ConsensusOutcome = 'pending' | 'winner_selected' | 'tie' | 'no_consensus';

export type AnalyticsEventName =
  | 'account_upgrade_completed'
  | 'account_upgrade_started'
  | 'app_opened'
  | 'final_plan_shared'
  | 'invite_opened'
  | 'room_created'
  | 'participant_joined'
  | 'invite_shared'
  | 'option_added'
  | 'vote_cast'
  | 'vote_completed'
  | 'voting_closed'
  | 'result_created'
  | 'no_consensus'
  | 'itinerary_viewed'
  | 'winner_selected'
  | 'itinerary_created'
  | 'error_shown';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type UserProfile = {
  id: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
};

export type PlanConstraints = {
  budgetTier: BudgetTier;
  energyLevel: EnergyLevel;
  locationMode: LocationMode;
  weatherMode: WeatherMode;
  planningEffort: PlanningEffort;
  categoryPreferences: PlanCategory[];
  startsAt?: string;
  endsAt?: string;
  locationLabel?: string;
  maxDistanceKm?: number;
  maxParticipants?: number;
};

export type PlanParticipant = {
  id: string;
  roomId: string;
  userId?: string;
  displayName: string;
  avatarUrl?: string;
  role: ParticipantRole;
  joinedAt: string;
  isReady: boolean;
};

export type PlanTemplate = {
  id: string;
  title: string;
  description?: string;
  category: PlanCategory;
  defaultConstraints: PlanConstraints;
  createdAt: string;
  updatedAt: string;
};

export type PlanOption = {
  id: string;
  roomId: string;
  title: string;
  description?: string;
  category: PlanCategory;
  budgetTier: BudgetTier;
  energyLevel: EnergyLevel;
  locationMode: LocationMode;
  weatherMode: WeatherMode;
  suggestedByParticipantId?: string;
  locationLabel?: string;
  startsAt?: string;
  endsAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type PlanVote = {
  id: string;
  roomId: string;
  optionId: string;
  participantId: string;
  value: VoteValue;
  createdAt: string;
  updatedAt: string;
};

export type ConsensusResult = {
  roomId: string;
  outcome: ConsensusOutcome;
  decisionMode: DecisionMode;
  winningOptionId?: string;
  tiedOptionIds: string[];
  voteCountsByOptionId: Record<string, Record<VoteValue, number>>;
  decidedAt?: string;
};

export type ItineraryItem = {
  id: string;
  optionId?: string;
  title: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  locationLabel?: string;
  sortOrder: number;
};

export type Itinerary = {
  id: string;
  roomId: string;
  title: string;
  items: ItineraryItem[];
  createdAt: string;
  updatedAt: string;
};

export type PlanRoom = {
  id: string;
  title: string;
  description?: string;
  status: RoomStatus;
  decisionMode: DecisionMode;
  hostUserId: string;
  inviteToken: string;
  constraints: PlanConstraints;
  participantIds: string[];
  optionIds: string[];
  selectedOptionId?: string;
  itineraryId?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};

export type AnalyticsEvent = {
  id: string;
  name: AnalyticsEventName;
  userId?: string;
  roomId?: string;
  participantId?: string;
  optionId?: string;
  properties: Record<string, JsonValue>;
  createdAt: string;
};
