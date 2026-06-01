export type CalendarPlanInput = {
  backupPlan: string;
  budget: string;
  endDate: Date;
  locationText: string;
  planTitle: string;
  shareLink: string;
  startDate: Date;
  steps: readonly string[];
};

const defaultDurationMinutes = 90;

function isValidDate(value: Date) {
  return !Number.isNaN(value.getTime());
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60000);
}

function getRoundedNextHour() {
  const now = new Date();
  const nextHour = new Date(now);

  nextHour.setHours(now.getHours() + 1, 0, 0, 0);

  return nextHour;
}

function getDurationSegmentMinutes(segment: string) {
  let minutes = 0;
  let matchedUnit = false;
  const hourMatches = segment.matchAll(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/gi);
  const minuteMatches = segment.matchAll(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/gi);

  for (const match of hourMatches) {
    const hours = Number(match[1]);

    if (Number.isFinite(hours)) {
      matchedUnit = true;
      minutes += Math.round(hours * 60);
    }
  }

  for (const match of minuteMatches) {
    const parsedMinutes = Number(match[1]);

    if (Number.isFinite(parsedMinutes)) {
      matchedUnit = true;
      minutes += Math.round(parsedMinutes);
    }
  }

  return matchedUnit && minutes > 0 ? minutes : undefined;
}

function parseDurationMinutes(durationText: string) {
  const normalizedText = durationText.toLowerCase().replace(/[\u2013\u2014]/g, '-');
  const candidateDurations = normalizedText
    .split(/\s+(?:to|or)\s+|-/)
    .map(getDurationSegmentMinutes)
    .filter((value): value is number => typeof value === 'number' && value > 0);

  if (candidateDurations.length === 0) {
    return defaultDurationMinutes;
  }

  return Math.max(...candidateDurations);
}

export function getDefaultCalendarDateRange(meetingTime: string, estimatedDuration: string) {
  const parsedStartDate = new Date(meetingTime);
  const startDate = isValidDate(parsedStartDate) ? parsedStartDate : getRoundedNextHour();
  const endDate = addMinutes(startDate, parseDurationMinutes(estimatedDuration));

  return {
    endDate,
    startDate,
  };
}

export function formatCalendarDateInput(date: Date) {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60000;
  const localDate = new Date(date.getTime() - timezoneOffsetMs);

  return localDate.toISOString().slice(0, 16);
}

export function parseCalendarDateInput(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return undefined;
  }

  const date = new Date(trimmedValue);

  return isValidDate(date) ? date : undefined;
}

export function buildCalendarEventNotes(input: CalendarPlanInput) {
  const steps = input.steps.map((step, index) => `${index + 1}. ${step}`).join('\n');

  return [
    'Plan Roulette final plan',
    '',
    'Steps',
    steps || 'No steps listed.',
    '',
    `Budget: ${input.budget}`,
    '',
    `Backup plan: ${input.backupPlan}`,
    '',
    `Share link: ${input.shareLink}`,
  ].join('\n');
}
