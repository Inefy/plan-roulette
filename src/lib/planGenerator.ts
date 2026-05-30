// src/lib/planGenerator.ts
import type { DietaryFlexibility, FoodMode, PlanTemplateDeckItem } from '../data/planTemplates';
import type { BudgetTier, EnergyLevel, LocationMode, PlanCategory, PlanningEffort, WeatherMode } from '../types/domain';

export type AccessibilityConstraints = {
  allowedLocationModes?: LocationMode[];
  allowedWeatherModes?: WeatherMode[];
  maxDurationMinutes?: number;
  maxEnergyLevel?: EnergyLevel;
  requiresIndoor?: boolean;
};

export type PlanGeneratorConstraints = {
  ageSensitiveAllowed?: boolean;
  budgetTiers?: BudgetTier[];
  categories?: PlanCategory[];
  dietaryFlexibility?: DietaryFlexibility[];
  duration?: {
    minMinutes?: number;
    maxMinutes?: number;
  };
  energyLevels?: EnergyLevel[];
  foodModes?: FoodMode[];
  groupSize?: number;
  locationModes?: LocationMode[];
  maxBudgetTier?: BudgetTier;
  maxEnergyLevel?: EnergyLevel;
  planningEfforts?: PlanningEffort[];
  requiresDietaryFlexible?: boolean;
  requiredTags?: string[];
  weatherModes?: WeatherMode[];
  accessibility?: AccessibilityConstraints;
};

export type PlanGeneratorOptions = {
  count?: number;
  maxResults?: number;
  minResults?: number;
  random?: () => number;
};

export type GeneratedPlanOption = PlanTemplateDeckItem & {
  fallbackLevel: number;
  matchReasons: string[];
  relaxedConstraints: RelaxableConstraint[];
  score: number;
  templateId: string;
};

type RelaxableConstraint = 'category' | 'duration' | 'energy' | 'foodMode' | 'planningEffort' | 'requiredTags';

type ScoredTemplate = {
  fallbackLevel: number;
  matchReasons: string[];
  relaxedConstraints: RelaxableConstraint[];
  score: number;
  template: PlanTemplateDeckItem;
};

const budgetRank: Record<BudgetTier, number> = {
  free: 0,
  low: 1,
  moderate: 2,
  high: 3,
  splurge: 4,
};

const energyRank: Record<EnergyLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

const defaultResultCount = 10;
const defaultMinResults = 8;
const defaultMaxResults = 12;

const fallbackStages: RelaxableConstraint[][] = [
  [],
  ['requiredTags'],
  ['category'],
  ['duration'],
  ['energy'],
  ['foodMode', 'planningEffort'],
];

function hasValues<T>(values: readonly T[] | undefined): values is readonly T[] {
  return Boolean(values && values.length > 0);
}

function overlaps<T>(left: readonly T[], right: readonly T[]) {
  return left.some((value) => right.includes(value));
}

function isBudgetAllowed(template: PlanTemplateDeckItem, constraints: PlanGeneratorConstraints) {
  if (hasValues(constraints.budgetTiers) && !constraints.budgetTiers.includes(template.budgetTier)) {
    return false;
  }

  if (constraints.maxBudgetTier && budgetRank[template.budgetTier] > budgetRank[constraints.maxBudgetTier]) {
    return false;
  }

  return true;
}

function isEnergyAllowed(template: PlanTemplateDeckItem, constraints: PlanGeneratorConstraints, relaxed: readonly RelaxableConstraint[]) {
  if (relaxed.includes('energy')) {
    return true;
  }

  if (hasValues(constraints.energyLevels) && !constraints.energyLevels.includes(template.energyLevel)) {
    return false;
  }

  if (constraints.maxEnergyLevel && energyRank[template.energyLevel] > energyRank[constraints.maxEnergyLevel]) {
    return false;
  }

  return true;
}

function isDurationAllowed(template: PlanTemplateDeckItem, constraints: PlanGeneratorConstraints, relaxed: readonly RelaxableConstraint[]) {
  if (relaxed.includes('duration') || !constraints.duration) {
    return true;
  }

  const { maxMinutes, minMinutes } = constraints.duration;

  if (typeof minMinutes === 'number' && template.duration.maxMinutes < minMinutes) {
    return false;
  }

  if (typeof maxMinutes === 'number' && template.duration.minMinutes > maxMinutes) {
    return false;
  }

  return true;
}

function isLocationCompatible(templateMode: LocationMode, requestedModes: readonly LocationMode[]) {
  if (requestedModes.includes(templateMode)) {
    return true;
  }

  if (templateMode === 'hybrid') {
    return requestedModes.includes('in_person') || requestedModes.includes('remote');
  }

  if (requestedModes.includes('hybrid')) {
    return templateMode === 'in_person' || templateMode === 'remote';
  }

  return false;
}

function isWeatherCompatible(templateModes: readonly WeatherMode[], requestedModes: readonly WeatherMode[]) {
  if (overlaps(templateModes, requestedModes)) {
    return true;
  }

  return templateModes.includes('weather_flexible') || requestedModes.includes('weather_flexible');
}

function isGroupSizeAllowed(template: PlanTemplateDeckItem, groupSize: number | undefined) {
  if (typeof groupSize !== 'number') {
    return true;
  }

  return template.groupSize.min <= groupSize && template.groupSize.max >= groupSize;
}

function isDietaryAllowed(template: PlanTemplateDeckItem, constraints: PlanGeneratorConstraints) {
  if (hasValues(constraints.dietaryFlexibility) && !constraints.dietaryFlexibility.includes(template.dietaryFlexibility)) {
    return false;
  }

  if (constraints.requiresDietaryFlexible) {
    return template.dietaryFlexibility === 'easy_to_adapt' || template.dietaryFlexibility === 'bring_your_own_friendly';
  }

  return true;
}

function isAccessibilityAllowed(template: PlanTemplateDeckItem, accessibility: AccessibilityConstraints | undefined) {
  if (!accessibility) {
    return true;
  }

  if (accessibility.requiresIndoor && !template.weatherCompatibility.includes('indoor')) {
    return false;
  }

  if (hasValues(accessibility.allowedLocationModes) && !isLocationCompatible(template.locationMode, accessibility.allowedLocationModes)) {
    return false;
  }

  if (hasValues(accessibility.allowedWeatherModes) && !isWeatherCompatible(template.weatherCompatibility, accessibility.allowedWeatherModes)) {
    return false;
  }

  if (accessibility.maxEnergyLevel && energyRank[template.energyLevel] > energyRank[accessibility.maxEnergyLevel]) {
    return false;
  }

  if (typeof accessibility.maxDurationMinutes === 'number' && template.duration.minMinutes > accessibility.maxDurationMinutes) {
    return false;
  }

  return true;
}

function passesHardFilters(template: PlanTemplateDeckItem, constraints: PlanGeneratorConstraints) {
  if (constraints.ageSensitiveAllowed === false && template.ageSensitive) {
    return false;
  }

  if (!isBudgetAllowed(template, constraints)) {
    return false;
  }

  if (hasValues(constraints.locationModes) && !isLocationCompatible(template.locationMode, constraints.locationModes)) {
    return false;
  }

  if (hasValues(constraints.weatherModes) && !isWeatherCompatible(template.weatherCompatibility, constraints.weatherModes)) {
    return false;
  }

  if (!isGroupSizeAllowed(template, constraints.groupSize)) {
    return false;
  }

  if (!isDietaryAllowed(template, constraints)) {
    return false;
  }

  return isAccessibilityAllowed(template, constraints.accessibility);
}

function passesSoftFilters(template: PlanTemplateDeckItem, constraints: PlanGeneratorConstraints, relaxed: readonly RelaxableConstraint[]) {
  if (!relaxed.includes('category') && hasValues(constraints.categories) && !constraints.categories.includes(template.category)) {
    return false;
  }

  if (!isDurationAllowed(template, constraints, relaxed)) {
    return false;
  }

  if (!isEnergyAllowed(template, constraints, relaxed)) {
    return false;
  }

  if (!relaxed.includes('foodMode') && hasValues(constraints.foodModes) && !overlaps(template.foodModes, constraints.foodModes)) {
    return false;
  }

  if (
    !relaxed.includes('planningEffort') &&
    hasValues(constraints.planningEfforts) &&
    !constraints.planningEfforts.includes(template.planningEffort)
  ) {
    return false;
  }

  if (!relaxed.includes('requiredTags') && hasValues(constraints.requiredTags) && !constraints.requiredTags.every((tag) => template.tags.includes(tag))) {
    return false;
  }

  return true;
}

function durationFitScore(template: PlanTemplateDeckItem, duration: PlanGeneratorConstraints['duration']) {
  if (!duration) {
    return 0;
  }

  const requestedMin = duration.minMinutes ?? template.duration.minMinutes;
  const requestedMax = duration.maxMinutes ?? template.duration.maxMinutes;
  const overlapMin = Math.max(template.duration.minMinutes, requestedMin);
  const overlapMax = Math.min(template.duration.maxMinutes, requestedMax);

  if (overlapMax < overlapMin) {
    return -8;
  }

  const requestedSpan = Math.max(requestedMax - requestedMin, 1);
  const overlapSpan = Math.max(overlapMax - overlapMin, 1);

  return Math.round((overlapSpan / requestedSpan) * 10);
}

function collectScore(template: PlanTemplateDeckItem, constraints: PlanGeneratorConstraints, fallbackLevel: number, relaxed: readonly RelaxableConstraint[]) {
  const matchReasons: string[] = [];
  let score = 20 - fallbackLevel * 6;

  if (hasValues(constraints.categories) && constraints.categories.includes(template.category)) {
    score += 18;
    matchReasons.push('category');
  }

  if (constraints.maxBudgetTier && budgetRank[template.budgetTier] <= budgetRank[constraints.maxBudgetTier]) {
    score += 14 - budgetRank[template.budgetTier];
    matchReasons.push('budget');
  } else if (hasValues(constraints.budgetTiers) && constraints.budgetTiers.includes(template.budgetTier)) {
    score += 12;
    matchReasons.push('budget');
  }

  const durationScore = durationFitScore(template, constraints.duration);
  if (durationScore > 0) {
    score += durationScore;
    matchReasons.push('duration');
  }

  if (constraints.maxEnergyLevel && energyRank[template.energyLevel] <= energyRank[constraints.maxEnergyLevel]) {
    score += 10 - energyRank[template.energyLevel];
    matchReasons.push('energy');
  } else if (hasValues(constraints.energyLevels) && constraints.energyLevels.includes(template.energyLevel)) {
    score += 10;
    matchReasons.push('energy');
  }

  if (hasValues(constraints.locationModes) && isLocationCompatible(template.locationMode, constraints.locationModes)) {
    score += constraints.locationModes.includes(template.locationMode) ? 10 : 6;
    matchReasons.push('location');
  }

  if (hasValues(constraints.weatherModes) && isWeatherCompatible(template.weatherCompatibility, constraints.weatherModes)) {
    score += overlaps(template.weatherCompatibility, constraints.weatherModes) ? 12 : 6;
    matchReasons.push('weather');
  }

  if (isGroupSizeAllowed(template, constraints.groupSize) && typeof constraints.groupSize === 'number') {
    score += 8;
    matchReasons.push('groupSize');
  }

  if (constraints.requiresDietaryFlexible || hasValues(constraints.dietaryFlexibility)) {
    score += 8;
    matchReasons.push('dietary');
  }

  if (constraints.accessibility && isAccessibilityAllowed(template, constraints.accessibility)) {
    score += 8;
    matchReasons.push('accessibility');
  }

  if (hasValues(constraints.foodModes) && overlaps(template.foodModes, constraints.foodModes)) {
    score += 6;
    matchReasons.push('foodMode');
  }

  if (hasValues(constraints.planningEfforts) && constraints.planningEfforts.includes(template.planningEffort)) {
    score += 5;
    matchReasons.push('planningEffort');
  }

  if (hasValues(constraints.requiredTags)) {
    const tagMatches = constraints.requiredTags.filter((tag) => template.tags.includes(tag)).length;
    score += tagMatches * 4;
    if (tagMatches > 0) {
      matchReasons.push('tags');
    }
  }

  return {
    fallbackLevel,
    matchReasons,
    relaxedConstraints: [...relaxed],
    score,
    template,
  };
}

function getResultBounds(options: PlanGeneratorOptions | undefined) {
  const maxResults = options?.maxResults ?? defaultMaxResults;
  const minResults = Math.min(options?.minResults ?? defaultMinResults, maxResults);
  const requestedCount = options?.count ?? defaultResultCount;
  const count = Math.min(Math.max(requestedCount, minResults), maxResults);

  return { count, minResults };
}

function shuffleWithinScoreBands(items: readonly ScoredTemplate[], random: () => number) {
  const grouped = new Map<number, ScoredTemplate[]>();

  for (const item of items) {
    const band = Math.floor(item.score / 10) * 10;
    grouped.set(band, [...(grouped.get(band) ?? []), item]);
  }

  return [...grouped.entries()]
    .sort(([leftBand], [rightBand]) => rightBand - leftBand)
    .flatMap(([, bandItems]) =>
      [...bandItems]
        .map((item) => ({ item, sort: random() }))
        .sort((left, right) => left.sort - right.sort)
        .map(({ item }) => item),
    );
}

function toGeneratedOption(item: ScoredTemplate): GeneratedPlanOption {
  return {
    ...item.template,
    fallbackLevel: item.fallbackLevel,
    matchReasons: item.matchReasons,
    relaxedConstraints: item.relaxedConstraints,
    score: item.score,
    templateId: item.template.id,
  };
}

export function generatePlanOptions(
  constraints: PlanGeneratorConstraints,
  templates: readonly PlanTemplateDeckItem[],
  options?: PlanGeneratorOptions,
): GeneratedPlanOption[] {
  const { count, minResults } = getResultBounds(options);
  const random = options?.random ?? Math.random;
  const hardFilteredTemplates = templates.filter((template) => passesHardFilters(template, constraints));
  const collectedByTemplateId = new Map<string, ScoredTemplate>();

  for (let fallbackLevel = 0; fallbackLevel < fallbackStages.length; fallbackLevel += 1) {
    const relaxed = fallbackStages[fallbackLevel];

    for (const template of hardFilteredTemplates) {
      if (collectedByTemplateId.has(template.id) || !passesSoftFilters(template, constraints, relaxed)) {
        continue;
      }

      collectedByTemplateId.set(template.id, collectScore(template, constraints, fallbackLevel, relaxed));
    }

    if (collectedByTemplateId.size >= minResults) {
      break;
    }
  }

  const ranked = [...collectedByTemplateId.values()].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return left.template.title.localeCompare(right.template.title);
  });

  return shuffleWithinScoreBands(ranked, random).slice(0, count).map(toGeneratedOption);
}
