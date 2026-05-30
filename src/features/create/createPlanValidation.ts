// src/features/create/createPlanValidation.ts
import type { BudgetTier, EnergyLevel, LocationMode, PlanCategory, WeatherMode } from '../../types/domain';
import type { PlanGeneratorConstraints } from '../../lib/planGenerator';

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

export type ParsedCreatePlanDraft = {
  duration?: PlanGeneratorConstraints['duration'];
  endsAt?: string;
  groupSize: number;
  startsAt?: string;
};

export type CreatePlanValidationResult = {
  errors: string[];
  parsed?: ParsedCreatePlanDraft;
};

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
