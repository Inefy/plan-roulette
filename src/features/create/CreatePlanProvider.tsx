// src/features/create/CreatePlanProvider.tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import { planTemplates } from '../../data/planTemplates';
import { trackAnalyticsEvent } from '../../lib/analytics';
import { buildInviteLink } from '../../lib/linkBuilder';
import { generatePlanOptions, type GeneratedPlanOption, type PlanGeneratorConstraints } from '../../lib/planGenerator';
import { getFriendlyRemoteError } from '../../lib/remoteErrors';
import { supabase } from '../../lib/supabase';
import type { BudgetTier, EnergyLevel, LocationMode, PlanCategory, WeatherMode } from '../../types/domain';
import { useAuth } from '../auth/AuthProvider';

export type CreatePlanDraft = {
  allowAgeSensitive: boolean;
  budgetTier: BudgetTier;
  categories: PlanCategory[];
  endsAt: string;
  energyLevel: EnergyLevel;
  groupSizeEstimate: string;
  locationMode: LocationMode;
  startsAt: string;
  title: string;
  weatherMode: WeatherMode;
};

export type CreatedRoomInvite = {
  inviteToken: string;
  inviteUrl: string;
  participantId: string;
  roomId: string;
};

type ParsedCreatePlanDraft = {
  duration?: PlanGeneratorConstraints['duration'];
  endsAt?: string;
  groupSize: number;
  startsAt?: string;
};

type CreatePlanValidationResult = {
  errors: string[];
  parsed?: ParsedCreatePlanDraft;
};

type CreatePlanContextValue = {
  createRoomWithOptions: () => Promise<CreatedRoomInvite | undefined>;
  createdInvite?: CreatedRoomInvite;
  draft: CreatePlanDraft;
  errorMessage?: string;
  generateOptions: () => GeneratedPlanOption[] | undefined;
  generatedOptions: GeneratedPlanOption[];
  isCreatingRoom: boolean;
  resetCreatePlan: () => void;
  setDraftValue: <Key extends keyof CreatePlanDraft>(key: Key, value: CreatePlanDraft[Key]) => void;
  toggleCategory: (category: PlanCategory) => void;
  validationErrors: string[];
};

type CreatePlanProviderProps = {
  children: ReactNode;
};

type CreateRoomRpcRow = {
  invite_token: string;
  participant_id: string;
  room_id: string;
};

const initialDraft: CreatePlanDraft = {
  allowAgeSensitive: false,
  budgetTier: 'moderate',
  categories: ['food', 'coffee', 'cheap'],
  endsAt: '',
  energyLevel: 'medium',
  groupSizeEstimate: '4',
  locationMode: 'in_person',
  startsAt: '',
  title: '',
  weatherMode: 'weather_flexible',
};

const CreatePlanContext = createContext<CreatePlanContextValue | undefined>(undefined);

function parseOptionalDateTime(value: string, label: string, errors: string[]) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return undefined;
  }

  const parsedDate = new Date(trimmedValue);

  if (Number.isNaN(parsedDate.getTime())) {
    errors.push(`${label} must be a valid date and time.`);
    return undefined;
  }

  return parsedDate;
}

function parseGroupSize(value: string, errors: string[]) {
  const parsedValue = Number(value.trim());

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    errors.push('Group size estimate must be a whole number of at least 1.');
    return undefined;
  }

  return parsedValue;
}

function buildDurationConstraint(startsAt: Date | undefined, endsAt: Date | undefined) {
  if (!startsAt || !endsAt) {
    return undefined;
  }

  const maxMinutes = Math.floor((endsAt.getTime() - startsAt.getTime()) / 60000);

  if (maxMinutes < 30) {
    return undefined;
  }

  return { maxMinutes };
}

export function validateCreatePlanDraft(draft: CreatePlanDraft): CreatePlanValidationResult {
  const errors: string[] = [];
  const title = draft.title.trim();

  if (!title) {
    errors.push('Title is required.');
  }

  if (draft.categories.length === 0) {
    errors.push('Choose at least one category.');
  }

  const groupSize = parseGroupSize(draft.groupSizeEstimate, errors);
  const startsAt = parseOptionalDateTime(draft.startsAt, 'Window start', errors);
  const endsAt = parseOptionalDateTime(draft.endsAt, 'Window end', errors);
  const hasOneTimeValue = Boolean(draft.startsAt.trim()) !== Boolean(draft.endsAt.trim());

  if (hasOneTimeValue) {
    errors.push('Add both a start and end time, or leave the date/time window blank.');
  }

  if (startsAt && endsAt && endsAt <= startsAt) {
    errors.push('Window end must be after window start.');
  }

  if (errors.length > 0 || !groupSize) {
    return { errors };
  }

  return {
    errors,
    parsed: {
      duration: buildDurationConstraint(startsAt, endsAt),
      endsAt: endsAt?.toISOString(),
      groupSize,
      startsAt: startsAt?.toISOString(),
    },
  };
}

function createGeneratorConstraints(draft: CreatePlanDraft, parsed: ParsedCreatePlanDraft): PlanGeneratorConstraints {
  return {
    ageSensitiveAllowed: draft.allowAgeSensitive,
    categories: draft.categories,
    duration: parsed.duration,
    groupSize: parsed.groupSize,
    locationModes: [draft.locationMode],
    maxBudgetTier: draft.budgetTier,
    maxEnergyLevel: draft.energyLevel,
    weatherModes: [draft.weatherMode],
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

function parseCreateRoomRpcRow(value: unknown): CreateRoomRpcRow {
  const rows = Array.isArray(value) ? value : [];
  const firstRow = rows[0] as Partial<CreateRoomRpcRow> | undefined;

  if (!firstRow?.room_id || !firstRow.participant_id || !firstRow.invite_token) {
    throw new Error('Supabase did not return the created room invite.');
  }

  return {
    invite_token: firstRow.invite_token,
    participant_id: firstRow.participant_id,
    room_id: firstRow.room_id,
  };
}

function getSessionDisplayName(session: Session) {
  const metadataName = session.user.user_metadata?.display_name;

  if (typeof metadataName === 'string' && metadataName.trim()) {
    return metadataName.trim();
  }

  if (session.user.email) {
    return session.user.email.split('@')[0];
  }

  return session.user.is_anonymous ? 'Guest planner' : 'Planner';
}

export function CreatePlanProvider({ children }: CreatePlanProviderProps) {
  const { session, signInAnonymously } = useAuth();
  const [createdInvite, setCreatedInvite] = useState<CreatedRoomInvite | undefined>();
  const [draft, setDraft] = useState<CreatePlanDraft>(initialDraft);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [generatedOptions, setGeneratedOptions] = useState<GeneratedPlanOption[]>([]);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const setDraftValue = useCallback(
    <Key extends keyof CreatePlanDraft>(key: Key, value: CreatePlanDraft[Key]) => {
      setDraft((currentDraft) => ({
        ...currentDraft,
        [key]: value,
      }));
      setErrorMessage(undefined);
      setValidationErrors([]);
    },
    [],
  );

  const toggleCategory = useCallback((category: PlanCategory) => {
    setDraft((currentDraft) => {
      const isSelected = currentDraft.categories.includes(category);

      return {
        ...currentDraft,
        categories: isSelected
          ? currentDraft.categories.filter((selectedCategory) => selectedCategory !== category)
          : [...currentDraft.categories, category],
      };
    });
    setErrorMessage(undefined);
    setValidationErrors([]);
  }, []);

  const generateOptions = useCallback(() => {
    const validation = validateCreatePlanDraft(draft);

    setErrorMessage(undefined);
    setValidationErrors(validation.errors);

    if (!validation.parsed) {
      setGeneratedOptions([]);
      return undefined;
    }

    const nextOptions = generatePlanOptions(createGeneratorConstraints(draft, validation.parsed), planTemplates, {
      count: 10,
      maxResults: 12,
      minResults: 8,
    });

    if (nextOptions.length < 8) {
      setGeneratedOptions(nextOptions);
      setErrorMessage('Only a few plans matched. Try a broader budget, location, weather, or category mix.');
      return undefined;
    }

    setGeneratedOptions(nextOptions);
    return nextOptions;
  }, [draft]);

  const ensureAuthenticatedSession = useCallback(async () => {
    if (session?.user) {
      return session;
    }

    await signInAnonymously('Guest planner');

    const { data, error } = await supabase.auth.getSession();

    if (error) {
      throw new Error(error.message);
    }

    if (!data.session?.user) {
      throw new Error('Sign in or continue as a guest before creating a room.');
    }

    return data.session;
  }, [session, signInAnonymously]);

  const createRoomWithOptions = useCallback(async () => {
    const validation = validateCreatePlanDraft(draft);

    setErrorMessage(undefined);
    setValidationErrors(validation.errors);

    if (!validation.parsed) {
      return undefined;
    }

    const optionsForRoom = generatedOptions.length >= 8 ? generatedOptions : generateOptions();

    if (!optionsForRoom || optionsForRoom.length < 8) {
      return undefined;
    }

    setIsCreatingRoom(true);

    try {
      const activeSession = await ensureAuthenticatedSession();
      const displayName = getSessionDisplayName(activeSession);

      const { data: roomData, error: roomError } = await supabase.rpc('create_plan_room', {
        p_budget_tier: draft.budgetTier,
        p_category_preferences: draft.categories,
        p_decision_mode: 'consensus',
        p_description: null,
        p_display_name: displayName,
        p_ends_at: validation.parsed.endsAt ?? null,
        p_energy_level: draft.energyLevel,
        p_location_mode: draft.locationMode,
        p_location_text: null,
        p_max_distance_km: null,
        p_max_participants: validation.parsed.groupSize,
        p_planning_effort: 'light',
        p_starts_at: validation.parsed.startsAt ?? null,
        p_title: draft.title.trim(),
        p_weather_mode: draft.weatherMode,
      });

      if (roomError) {
        throw new Error(roomError.message);
      }

      const createdRoom = parseCreateRoomRpcRow(roomData as unknown);
      const { error: optionsError } = await supabase.rpc('add_generated_options_to_room', {
        p_options: optionsForRoom.map(toGeneratedOptionPayload),
        p_room_id: createdRoom.room_id,
      });

      if (optionsError) {
        throw new Error(optionsError.message);
      }

      trackAnalyticsEvent({
        name: 'room_created',
        participantId: createdRoom.participant_id,
        properties: {
          budgetTier: draft.budgetTier,
          categoryCount: draft.categories.length,
          decisionMode: 'consensus',
          optionCount: optionsForRoom.length,
          participantCount: 1,
        },
        roomId: createdRoom.room_id,
      });

      const nextInvite = {
        inviteToken: createdRoom.invite_token,
        inviteUrl: buildInviteLink(createdRoom.invite_token),
        participantId: createdRoom.participant_id,
        roomId: createdRoom.room_id,
      };

      setCreatedInvite(nextInvite);
      return nextInvite;
    } catch (error) {
      const friendlyError = getFriendlyRemoteError(error, 'create_room', {
        message: 'Unable to create this plan room. Check your connection and try again.',
        retryable: true,
        title: 'Room not created',
      });

      setErrorMessage(friendlyError.message);
      return undefined;
    } finally {
      setIsCreatingRoom(false);
    }
  }, [draft, ensureAuthenticatedSession, generateOptions, generatedOptions]);

  const resetCreatePlan = useCallback(() => {
    setCreatedInvite(undefined);
    setDraft(initialDraft);
    setErrorMessage(undefined);
    setGeneratedOptions([]);
    setValidationErrors([]);
  }, []);

  const value = useMemo<CreatePlanContextValue>(
    () => ({
      createRoomWithOptions,
      createdInvite,
      draft,
      errorMessage,
      generateOptions,
      generatedOptions,
      isCreatingRoom,
      resetCreatePlan,
      setDraftValue,
      toggleCategory,
      validationErrors,
    }),
    [
      createRoomWithOptions,
      createdInvite,
      draft,
      errorMessage,
      generateOptions,
      generatedOptions,
      isCreatingRoom,
      resetCreatePlan,
      setDraftValue,
      toggleCategory,
      validationErrors,
    ],
  );

  return <CreatePlanContext.Provider value={value}>{children}</CreatePlanContext.Provider>;
}

export function useCreatePlan() {
  const context = useContext(CreatePlanContext);

  if (!context) {
    throw new Error('useCreatePlan must be used inside CreatePlanProvider.');
  }

  return context;
}
