// src/lib/itineraryBuilder.ts
import type { BudgetTier, LocationMode, PlanCategory, PlanParticipant, PlanRoom } from '../types/domain';

type ItineraryTemplateCategory = Extract<
  PlanCategory,
  'food' | 'coffee' | 'movie' | 'walk' | 'hike' | 'study' | 'rainy_day' | 'at_home' | 'game_night' | 'bars' | 'wildcard'
>;

export type ItineraryWinningOption = {
  backupPlan?: string;
  budgetTier?: BudgetTier;
  category: PlanCategory;
  description?: string;
  duration?: {
    maxMinutes: number;
    minMinutes: number;
  };
  id: string;
  locationLabel?: string;
  locationMode?: LocationMode;
  shareSummary?: string;
  startsAt?: string;
  steps?: readonly string[];
  title: string;
};

export type BuiltItinerary = {
  backupPlan: string;
  estimatedBudget: string;
  estimatedDuration: string;
  locationText: string;
  meetingTime: string;
  participantSummary: string;
  shareText: string;
  steps: string[];
  summary: string;
  title: string;
};

type CategoryItineraryTemplate = {
  backupPlan: string;
  locationNoun: string;
  shareVerb: string;
  steps: string[];
  summary: string;
};

const categoryItineraryTemplates = {
  at_home: {
    backupPlan: 'Keep the plan cozy and switch to a shorter at-home hangout if energy drops.',
    locationNoun: 'home base or shared indoor spot',
    shareVerb: 'settle in for',
    steps: ['Confirm the host or shared space.', 'Set up the main activity area.', 'Keep snacks and opt-out breaks easy.'],
    summary: 'A comfortable at-home plan with simple setup and room to adjust.',
  },
  bars: {
    backupPlan: 'Move to a cafe, diner, or all-ages lounge with non-alcoholic options.',
    locationNoun: 'lounge, patio, or late-hours spot with zero-proof choices',
    shareVerb: 'meet up for',
    steps: ['Confirm age and entry rules.', 'Check for mocktails, soda, tea, or food options.', 'Agree on a comfortable end time.'],
    summary: 'A social outing where alcohol is optional and non-alcoholic choices are part of the plan.',
  },
  coffee: {
    backupPlan: 'Grab takeout drinks or switch to a remote coffee check-in.',
    locationNoun: 'cafe or comfortable drink spot',
    shareVerb: 'grab',
    steps: ['Confirm the cafe is open and has seating.', 'Check drink and snack flexibility.', 'Pick a short catch-up window.'],
    summary: 'A low-pressure cafe plan for drinks, snacks, and conversation.',
  },
  food: {
    backupPlan: 'Choose a flexible takeout option or a build-your-own meal spot.',
    locationNoun: 'casual meal spot',
    shareVerb: 'eat',
    steps: ['Confirm dietary needs before ordering.', 'Pick a menu with flexible choices.', 'Decide whether to split items or order separately.'],
    summary: 'A food plan with flexible ordering and clear dietary checks.',
  },
  game_night: {
    backupPlan: 'Switch to a quick phone-friendly party game or a cooperative puzzle.',
    locationNoun: 'table, living room, or shared game space',
    shareVerb: 'play',
    steps: ['Pick games with clear rules and quick rounds.', 'Set up enough seating and chargers.', 'Keep score optional unless everyone wants it.'],
    summary: 'A game-focused hangout built around easy setup and flexible participation.',
  },
  hike: {
    backupPlan: 'Swap to a paved park loop, indoor walk, or cafe meetup if weather or trail conditions shift.',
    locationNoun: 'trailhead or public outdoor route',
    shareVerb: 'head out for',
    steps: ['Check weather, daylight, and trail conditions.', 'Share water, footwear, and meetup details.', 'Set a turnaround time before starting.'],
    summary: 'A trail plan with daylight, weather, and comfort checks built in.',
  },
  movie: {
    backupPlan: 'Watch a shorter episode, switch titles, or move the watch plan home.',
    locationNoun: 'theater, couch, or shared watch room',
    shareVerb: 'watch',
    steps: ['Confirm the title, rating, and runtime.', 'Decide on seats or the watch link.', 'Keep snacks optional and easy.'],
    summary: 'A movie plan with the title, timing, and snack expectations clear.',
  },
  rainy_day: {
    backupPlan: 'Move to another dry indoor public spot or a remote version of the same activity.',
    locationNoun: 'dry indoor spot',
    shareVerb: 'do',
    steps: ['Confirm the indoor location is open.', 'Plan transit or parking around the weather.', 'Bring a low-effort backup activity.'],
    summary: 'A weather-safe plan for staying dry without over-planning.',
  },
  study: {
    backupPlan: 'Move to a remote focus call or a quieter table if the first spot is busy.',
    locationNoun: 'library, cafe, or remote focus room',
    shareVerb: 'focus on',
    steps: ['Set one clear work goal each.', 'Choose a quiet block length.', 'Do a short progress check before wrapping.'],
    summary: 'A focused study plan with accountability and a clear work window.',
  },
  walk: {
    backupPlan: 'Use an indoor route like a mall, library, or campus building if weather turns.',
    locationNoun: 'walkable public route',
    shareVerb: 'take',
    steps: ['Choose a clear start point.', 'Set a comfortable pace and turnaround time.', 'Add an optional drink or rest stop.'],
    summary: 'A simple walk plan with a clear route and flexible pace.',
  },
  wildcard: {
    backupPlan: 'Spin again or choose the easiest low-cost public alternative.',
    locationNoun: 'safe public spot or flexible shared space',
    shareVerb: 'try',
    steps: ['Confirm the idea is safe, accessible, and low-pressure.', 'Set a time box.', 'Keep a simple alternate plan ready.'],
    summary: 'A flexible wildcard plan with safety and comfort checks first.',
  },
} satisfies Record<ItineraryTemplateCategory, CategoryItineraryTemplate>;

const budgetLabels: Record<BudgetTier, string> = {
  free: 'Free',
  high: 'Higher budget',
  low: 'Low cost',
  moderate: 'Moderate',
  splurge: 'Special occasion',
};

const locationModeLabels: Record<LocationMode, string> = {
  hybrid: 'a hybrid-friendly setup',
  in_person: 'an in-person spot',
  remote: 'a remote room or shared call',
};

function getTemplate(category: PlanCategory) {
  if (category in categoryItineraryTemplates) {
    return categoryItineraryTemplates[category as ItineraryTemplateCategory];
  }

  return categoryItineraryTemplates.wildcard;
}

function formatParticipantSummary(participants: readonly PlanParticipant[]) {
  if (participants.length === 0) {
    return 'No participants confirmed yet';
  }

  if (participants.length === 1) {
    return `1 participant: ${participants[0].displayName}`;
  }

  const names = participants.map((participant) => participant.displayName).slice(0, 3);
  const extraCount = participants.length - names.length;
  const suffix = extraCount > 0 ? ` and ${extraCount} more` : '';

  return `${participants.length} participants: ${names.join(', ')}${suffix}`;
}

function formatMeetingTime(winningOption: ItineraryWinningOption, room: PlanRoom) {
  return winningOption.startsAt ?? room.constraints.startsAt ?? 'Time TBD';
}

function estimateDurationFromTimes(startsAt: string | undefined, endsAt: string | undefined) {
  if (!startsAt || !endsAt) {
    return undefined;
  }

  const startTime = Date.parse(startsAt);
  const endTime = Date.parse(endsAt);

  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime <= startTime) {
    return undefined;
  }

  return Math.round((endTime - startTime) / 60000);
}

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remainingMinutes} min`;
}

function formatEstimatedDuration(winningOption: ItineraryWinningOption, room: PlanRoom) {
  if (winningOption.duration) {
    return `${formatDuration(winningOption.duration.minMinutes)} to ${formatDuration(winningOption.duration.maxMinutes)}`;
  }

  const estimatedMinutes = estimateDurationFromTimes(winningOption.startsAt ?? room.constraints.startsAt, room.constraints.endsAt);

  if (estimatedMinutes) {
    return formatDuration(estimatedMinutes);
  }

  return 'Duration TBD';
}

function formatEstimatedBudget(winningOption: ItineraryWinningOption, room: PlanRoom) {
  return budgetLabels[winningOption.budgetTier ?? room.constraints.budgetTier];
}

function formatLocationText(winningOption: ItineraryWinningOption, room: PlanRoom, template: CategoryItineraryTemplate) {
  if (winningOption.locationLabel) {
    return winningOption.locationLabel;
  }

  if (room.constraints.locationLabel) {
    return room.constraints.locationLabel;
  }

  const mode = winningOption.locationMode ?? room.constraints.locationMode;

  return `Use ${locationModeLabels[mode]} for this ${template.locationNoun}.`;
}

function uniqueSteps(steps: readonly string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const step of steps) {
    if (!seen.has(step)) {
      seen.add(step);
      result.push(step);
    }
  }

  return result;
}

function buildShareText(input: {
  backupPlan: string;
  estimatedBudget: string;
  estimatedDuration: string;
  locationText: string;
  meetingTime: string;
  participantSummary: string;
  shareVerb: string;
  summary: string;
  title: string;
}) {
  return [
    `Plan Roulette picked ${input.title}.`,
    `We will ${input.shareVerb} ${input.summary}`,
    `Meet: ${input.meetingTime}.`,
    `Where: ${input.locationText}.`,
    `Budget: ${input.estimatedBudget}.`,
    `Duration: ${input.estimatedDuration}.`,
    `People: ${input.participantSummary}.`,
    `Backup: ${input.backupPlan}.`,
  ].join(' ');
}

export function buildItinerary(
  winningOption: ItineraryWinningOption,
  room: PlanRoom,
  participants: readonly PlanParticipant[],
): BuiltItinerary {
  const template = getTemplate(winningOption.category);
  const title = winningOption.title;
  const summary = winningOption.shareSummary ?? winningOption.description ?? template.summary;
  const meetingTime = formatMeetingTime(winningOption, room);
  const locationText = formatLocationText(winningOption, room, template);
  const estimatedBudget = formatEstimatedBudget(winningOption, room);
  const estimatedDuration = formatEstimatedDuration(winningOption, room);
  const steps = uniqueSteps([...template.steps, ...(winningOption.steps ?? [])]);
  const backupPlan = winningOption.backupPlan ?? template.backupPlan;
  const participantSummary = formatParticipantSummary(participants);
  const shareText = buildShareText({
    backupPlan,
    estimatedBudget,
    estimatedDuration,
    locationText,
    meetingTime,
    participantSummary,
    shareVerb: template.shareVerb,
    summary,
    title,
  });

  return {
    backupPlan,
    estimatedBudget,
    estimatedDuration,
    locationText,
    meetingTime,
    participantSummary,
    shareText,
    steps,
    summary,
    title,
  };
}
