// src/lib/roomFinalizer.ts
import { calculateConsensus, type ConsensusParticipant, type ConsensusVote } from './consensusEngine';
import { buildItinerary, type BuiltItinerary, type ItineraryWinningOption } from './itineraryBuilder';
import { planTemplates } from '../data/planTemplates';
import { trackAnalyticsEvent } from './analytics';
import { generatePlanOptions, type GeneratedPlanOption } from './planGenerator';
import { supabase } from './supabase';
import type {
  BudgetTier,
  DecisionMode,
  EnergyLevel,
  LocationMode,
  ParticipantRole,
  PlanCategory,
  PlanParticipant,
  PlanRoom,
  PlanningEffort,
  RoomStatus,
  VoteValue,
  WeatherMode,
} from '../types/domain';

export type RoomFinalizationErrorKind = 'network' | 'no_consensus' | 'not_enough_votes' | 'permission' | 'tie';
export type RoomFinalizationOutcome = 'no_consensus' | 'tie' | 'winner_selected';

type RoomRow = {
  budget_tier: BudgetTier;
  category_preferences: PlanCategory[];
  created_at: string;
  decision_mode: DecisionMode;
  ends_at: string | null;
  energy_level: EnergyLevel;
  expires_at: string | null;
  host_user_id: string;
  id: string;
  invite_token: string;
  location_mode: LocationMode;
  location_text: string | null;
  max_distance_km: number | null;
  max_participants: number | null;
  planning_effort: PlanningEffort;
  starts_at: string | null;
  status: RoomStatus;
  title: string;
  updated_at: string;
  weather_mode: WeatherMode;
};

type ParticipantRow = {
  display_name: string;
  id: string;
  is_ready: boolean;
  joined_at: string;
  role: ParticipantRole;
  room_id: string;
  user_id: string | null;
};

type OptionRow = {
  backup_plan: string | null;
  budget_tier: BudgetTier;
  category: PlanCategory;
  constraint_match_score: number | string | null;
  description: string | null;
  ends_at: string | null;
  energy_level: EnergyLevel;
  id: string;
  is_active?: boolean;
  location_mode: LocationMode;
  location_text: string | null;
  max_duration_minutes: number | null;
  min_duration_minutes: number | null;
  room_id: string;
  share_summary: string | null;
  starts_at: string | null;
  steps: string[] | null;
  title: string;
};

type VoteRow = {
  option_id: string;
  participant_id: string;
  value: VoteValue;
};

type FinalizerOption = ItineraryWinningOption & {
  constraintMatchScore: number;
};

export type FinalizedRoomResult = {
  itinerary?: BuiltItinerary;
  outcome: RoomFinalizationOutcome;
  reason: string;
  resultId?: string;
  tiedOptionIds: string[];
  winningOptionId?: string;
};

export type RecoveryActionResult = {
  message: string;
  optionCount?: number;
};

export class RoomFinalizationError extends Error {
  kind: RoomFinalizationErrorKind;

  constructor(kind: RoomFinalizationErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

function isPermissionMessage(message: string) {
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes('permission') ||
    normalizedMessage.includes('row-level security') ||
    normalizedMessage.includes('only the host') ||
    normalizedMessage.includes('not authorized')
  );
}

function throwFinalizationError(message: string): never {
  if (isPermissionMessage(message)) {
    throw new RoomFinalizationError('permission', 'Only the host can close voting and pick a winner.');
  }

  throw new RoomFinalizationError('network', message || 'Unable to finalize this room.');
}

function parseConstraintScore(value: number | string | null) {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : 0;
  }

  return 0;
}

function getOutcome(noConsensus: boolean, tiedOptionIds: readonly string[]): RoomFinalizationOutcome {
  if (tiedOptionIds.length > 1) {
    return 'tie';
  }

  return noConsensus ? 'no_consensus' : 'winner_selected';
}

function getVoteCountsByOptionId(scoreBreakdown: ReturnType<typeof calculateConsensus<FinalizerOption>>['scoreBreakdown']) {
  return scoreBreakdown.reduce<Record<string, Record<VoteValue, number>>>((accumulator, breakdown) => {
    accumulator[breakdown.optionId] = breakdown.voteCounts;
    return accumulator;
  }, {});
}

function hasEnoughVotes(options: readonly OptionRow[], participants: readonly ParticipantRow[], votes: readonly VoteRow[]) {
  if (options.length === 0 || participants.length === 0 || votes.length === 0) {
    return false;
  }

  const optionIds = new Set(options.map((option) => option.id));

  return votes.some((vote) => optionIds.has(vote.option_id));
}

function toFinalizerOption(option: OptionRow): FinalizerOption {
  return {
    backupPlan: option.backup_plan ?? undefined,
    budgetTier: option.budget_tier,
    category: option.category,
    constraintMatchScore: parseConstraintScore(option.constraint_match_score),
    description: option.description ?? undefined,
    duration:
      option.min_duration_minutes && option.max_duration_minutes
        ? {
            maxMinutes: option.max_duration_minutes,
            minMinutes: option.min_duration_minutes,
          }
        : undefined,
    id: option.id,
    locationLabel: option.location_text ?? undefined,
    locationMode: option.location_mode,
    shareSummary: option.share_summary ?? undefined,
    startsAt: option.starts_at ?? undefined,
    steps: option.steps ?? undefined,
    title: option.title,
  };
}

function toGeneratedOptionPayload(option: GeneratedPlanOption) {
  return {
    ageSensitive: option.ageSensitive,
    backupPlan: option.backupPlan,
    budgetTier: option.budgetTier,
    category: option.category,
    constraintMatchScore: option.score,
    description: option.description,
    dietaryFlexibility: option.dietaryFlexibility,
    duration: option.duration,
    energyLevel: option.energyLevel,
    foodModes: option.foodModes,
    groupSize: option.groupSize,
    locationMode: option.locationMode,
    planningEffort: option.planningEffort,
    score: option.score,
    shareSummary: option.shareSummary,
    steps: option.steps,
    tags: option.tags,
    title: option.title,
    weatherCompatibility: option.weatherCompatibility,
  };
}

function toConsensusVote(vote: VoteRow): ConsensusVote {
  return {
    optionId: vote.option_id,
    participantId: vote.participant_id,
    value: vote.value,
  };
}

function toConsensusParticipant(participant: ParticipantRow): ConsensusParticipant {
  return {
    id: participant.id,
    role: participant.role,
  };
}

function toPlanParticipant(participant: ParticipantRow): PlanParticipant {
  return {
    displayName: participant.display_name,
    id: participant.id,
    isReady: participant.is_ready,
    joinedAt: participant.joined_at,
    role: participant.role,
    roomId: participant.room_id,
    userId: participant.user_id ?? undefined,
  };
}

function toPlanRoom(room: RoomRow, participants: readonly ParticipantRow[], options: readonly OptionRow[]): PlanRoom {
  return {
    constraints: {
      budgetTier: room.budget_tier,
      categoryPreferences: room.category_preferences,
      endsAt: room.ends_at ?? undefined,
      energyLevel: room.energy_level,
      locationLabel: room.location_text ?? undefined,
      locationMode: room.location_mode,
      maxDistanceKm: room.max_distance_km ?? undefined,
      maxParticipants: room.max_participants ?? undefined,
      planningEffort: room.planning_effort,
      startsAt: room.starts_at ?? undefined,
      weatherMode: room.weather_mode,
    },
    createdAt: room.created_at,
    decisionMode: room.decision_mode,
    hostUserId: room.host_user_id,
    id: room.id,
    inviteToken: room.invite_token,
    optionIds: options.map((option) => option.id),
    participantIds: participants.map((participant) => participant.id),
    status: room.status,
    title: room.title,
    updatedAt: room.updated_at,
  };
}

async function fetchFinalizationState(roomId: string) {
  const { data: roomData, error: roomError } = await supabase
    .from('plan_rooms')
    .select(
      [
        'id',
        'title',
        'status',
        'decision_mode',
        'host_user_id',
        'invite_token',
        'budget_tier',
        'energy_level',
        'location_mode',
        'weather_mode',
        'planning_effort',
        'category_preferences',
        'starts_at',
        'ends_at',
        'location_text',
        'max_distance_km',
        'max_participants',
        'expires_at',
        'created_at',
        'updated_at',
      ].join(', '),
    )
    .eq('id', roomId)
    .single();

  if (roomError) {
    throwFinalizationError(roomError.message);
  }

  const { data: participantData, error: participantError } = await supabase
    .from('plan_participants')
    .select('id, room_id, user_id, display_name, role, joined_at, is_ready')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true });

  if (participantError) {
    throwFinalizationError(participantError.message);
  }

  const { data: optionData, error: optionError } = await supabase
    .from('plan_options')
    .select(
      [
        'id',
        'is_active',
        'room_id',
        'title',
        'description',
        'category',
        'budget_tier',
        'min_duration_minutes',
        'max_duration_minutes',
        'energy_level',
        'location_mode',
        'constraint_match_score',
        'steps',
        'backup_plan',
        'share_summary',
        'location_text',
        'starts_at',
        'ends_at',
      ].join(', '),
    )
    .eq('room_id', roomId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (optionError) {
    throwFinalizationError(optionError.message);
  }

  const { data: voteData, error: voteError } = await supabase
    .from('plan_votes')
    .select('option_id, participant_id, value')
    .eq('room_id', roomId);

  if (voteError) {
    throwFinalizationError(voteError.message);
  }

  return {
    options: (optionData ?? []) as unknown as OptionRow[],
    participants: (participantData ?? []) as ParticipantRow[],
    room: roomData as unknown as RoomRow,
    votes: (voteData ?? []) as VoteRow[],
  };
}

async function startVotingRound(roomId: string, activeOptionIds?: readonly string[]) {
  const { error } = await supabase.rpc('start_voting_round', {
    p_active_option_ids: activeOptionIds ? [...activeOptionIds] : null,
    p_room_id: roomId,
  });

  if (error) {
    throwFinalizationError(error.message);
  }
}

function getCompromiseCategories(room: RoomRow, options: readonly OptionRow[], preferredOptionIds: readonly string[]) {
  const preferredCategories = preferredOptionIds
    .map((optionId) => options.find((option) => option.id === optionId)?.category)
    .filter((category): category is PlanCategory => Boolean(category));

  return [...new Set([...preferredCategories, ...room.category_preferences])];
}

function getUniqueGeneratedOptions(generatedOptions: readonly GeneratedPlanOption[], existingOptions: readonly OptionRow[]) {
  const existingTitles = new Set(existingOptions.map((option) => option.title.trim().toLowerCase()));
  const uniqueOptions = generatedOptions.filter((option) => !existingTitles.has(option.title.trim().toLowerCase()));

  return uniqueOptions.length > 0 ? uniqueOptions : generatedOptions;
}

async function storeFinalizedResult(input: {
  decisionMode: DecisionMode;
  itinerary?: BuiltItinerary;
  outcome: RoomFinalizationOutcome;
  reason: string;
  roomId: string;
  scoreBreakdown: ReturnType<typeof calculateConsensus<FinalizerOption>>['scoreBreakdown'];
  tiedOptionIds: string[];
  voteCountsByOptionId: Record<string, Record<VoteValue, number>>;
  winningOptionId?: string;
}) {
  const decidedAt = new Date().toISOString();
  const { data, error } = await supabase.rpc('store_room_result', {
    p_itinerary: input.itinerary ?? null,
    p_result: {
      decidedAt,
      decisionMode: input.decisionMode,
      noConsensus: input.outcome !== 'winner_selected',
      outcome: input.outcome,
      reason: input.reason,
      scoreBreakdown: input.scoreBreakdown,
      tiedOptionIds: input.tiedOptionIds,
      voteCountsByOptionId: input.voteCountsByOptionId,
      winningOptionId: input.winningOptionId ?? null,
    },
    p_room_id: input.roomId,
  });

  if (error) {
    throwFinalizationError(error.message);
  }

  const firstRow = Array.isArray(data) ? (data[0] as { result_id?: string } | undefined) : undefined;

  return firstRow?.result_id;
}

export async function finalizeRoomResult(roomId: string): Promise<FinalizedRoomResult> {
  const { options, participants, room, votes } = await fetchFinalizationState(roomId);

  if (!hasEnoughVotes(options, participants, votes)) {
    throw new RoomFinalizationError('not_enough_votes', 'There are not enough votes to pick a winner yet.');
  }

  const finalizerOptions = options.map(toFinalizerOption);
  const consensusResult = calculateConsensus(
    finalizerOptions,
    votes.map(toConsensusVote),
    participants.map(toConsensusParticipant),
    room.decision_mode,
  );
  const outcome = getOutcome(consensusResult.noConsensus, consensusResult.tiedOptionIds);
  const winningOption = consensusResult.winningOption;
  const itinerary =
    winningOption && outcome === 'winner_selected'
      ? buildItinerary(winningOption, toPlanRoom(room, participants, options), participants.map(toPlanParticipant))
      : undefined;
  const resultId = await storeFinalizedResult({
    decisionMode: room.decision_mode,
    itinerary,
    outcome,
    reason: consensusResult.reason,
    roomId,
    scoreBreakdown: consensusResult.scoreBreakdown,
    tiedOptionIds: consensusResult.tiedOptionIds,
    voteCountsByOptionId: getVoteCountsByOptionId(consensusResult.scoreBreakdown),
    winningOptionId: winningOption?.id,
  });

  trackAnalyticsEvent({
    name: 'result_created',
    properties: {
      budgetTier: room.budget_tier,
      categoryCount: room.category_preferences.length,
      decisionMode: room.decision_mode,
      optionCount: options.length,
      participantCount: participants.length,
      resultStatus: outcome,
    },
    roomId,
  });

  if (consensusResult.noConsensus) {
    trackAnalyticsEvent({
      name: 'no_consensus',
      properties: {
        budgetTier: room.budget_tier,
        categoryCount: room.category_preferences.length,
        decisionMode: room.decision_mode,
        optionCount: options.length,
        participantCount: participants.length,
        resultStatus: outcome,
      },
      roomId,
    });
  }

  return {
    itinerary,
    outcome,
    reason: consensusResult.reason,
    resultId,
    tiedOptionIds: consensusResult.tiedOptionIds,
    winningOptionId: winningOption?.id,
  };
}

export async function startTopTwoRunoff(roomId: string, optionIds: readonly string[]): Promise<RecoveryActionResult> {
  const topTwoOptionIds = optionIds.slice(0, 2);

  if (topTwoOptionIds.length < 2) {
    throw new RoomFinalizationError('not_enough_votes', 'A runoff needs two options.');
  }

  await startVotingRound(roomId, topTwoOptionIds);

  return {
    message: 'A top-two runoff is ready. Everyone can vote again on the two closest choices.',
    optionCount: topTwoOptionIds.length,
  };
}

export async function generateCompromiseOptions(roomId: string, preferredOptionIds: readonly string[]): Promise<RecoveryActionResult> {
  const { options, room } = await fetchFinalizationState(roomId);
  const generatedOptions = generatePlanOptions(
    {
      ageSensitiveAllowed: false,
      categories: getCompromiseCategories(room, options, preferredOptionIds),
      groupSize: room.max_participants ?? undefined,
      locationModes: [room.location_mode],
      maxBudgetTier: room.budget_tier,
      maxEnergyLevel: room.energy_level,
      weatherModes: [room.weather_mode],
    },
    planTemplates,
    {
      count: 4,
      maxResults: 4,
      minResults: 2,
    },
  );
  const compromiseOptions = getUniqueGeneratedOptions(generatedOptions, options).slice(0, 4);

  if (compromiseOptions.length === 0) {
    throw new RoomFinalizationError('no_consensus', 'No compromise options could be generated yet.');
  }

  const { error } = await supabase.rpc('add_generated_options_to_room', {
    p_options: compromiseOptions.map(toGeneratedOptionPayload),
    p_room_id: roomId,
  });

  if (error) {
    throwFinalizationError(error.message);
  }

  await startVotingRound(roomId);

  return {
    message: `${compromiseOptions.length} compromise options were added for a fresh vote.`,
    optionCount: compromiseOptions.length,
  };
}

export async function hostDecideWinner(roomId: string, optionId: string): Promise<FinalizedRoomResult> {
  const { options, participants, room, votes } = await fetchFinalizationState(roomId);
  const selectedOption = options.find((option) => option.id === optionId);

  if (!selectedOption) {
    throw new RoomFinalizationError('not_enough_votes', 'Choose one of the available options before the host decides.');
  }

  const finalizerOptions = options.map(toFinalizerOption);
  const consensusResult = calculateConsensus(
    finalizerOptions,
    votes.map(toConsensusVote),
    participants.map(toConsensusParticipant),
    room.decision_mode,
  );
  const winningOption = toFinalizerOption(selectedOption);
  const itinerary = buildItinerary(winningOption, toPlanRoom(room, participants, options), participants.map(toPlanParticipant));
  const reason = 'The host made a final call after the group needed a gentle tie-break.';
  const resultId = await storeFinalizedResult({
    decisionMode: 'host_pick',
    itinerary,
    outcome: 'winner_selected',
    reason,
    roomId,
    scoreBreakdown: consensusResult.scoreBreakdown,
    tiedOptionIds: [],
    voteCountsByOptionId: getVoteCountsByOptionId(consensusResult.scoreBreakdown),
    winningOptionId: optionId,
  });

  trackAnalyticsEvent({
    name: 'result_created',
    optionId,
    properties: {
      budgetTier: room.budget_tier,
      categoryCount: room.category_preferences.length,
      decisionMode: 'host_pick',
      optionCount: options.length,
      participantCount: participants.length,
      resultStatus: 'winner_selected',
    },
    roomId,
  });

  return {
    itinerary,
    outcome: 'winner_selected',
    reason,
    resultId,
    tiedOptionIds: [],
    winningOptionId: optionId,
  };
}
