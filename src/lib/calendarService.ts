// src/lib/calendarService.ts
import { Platform } from 'react-native';
import type * as ExpoCalendar from 'expo-calendar';

type CalendarModule = typeof ExpoCalendar;

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

export type AddPlanToCalendarStatus = 'canceled' | 'created' | 'permission_denied' | 'unavailable';

export type AddPlanToCalendarResult = {
  message: string;
  status: AddPlanToCalendarStatus;
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

function parseDurationMinutes(durationText: string) {
  const durations = [...durationText.matchAll(/(?:(\d+)\s*hr)?\s*(?:(\d+)\s*min)?/g)]
    .map((match) => {
      const hours = Number(match[1] ?? 0);
      const minutes = Number(match[2] ?? 0);

      return hours * 60 + minutes;
    })
    .filter((value) => Number.isFinite(value) && value > 0);

  if (durations.length === 0) {
    return defaultDurationMinutes;
  }

  return Math.max(...durations);
}

function isPermissionGranted(permission: { granted?: boolean; status?: string }) {
  return permission.granted === true || permission.status === 'granted';
}

function isCanceledAction(action: string | undefined) {
  return action === 'canceled' || action === 'deleted';
}

async function getWritableCalendar(Calendar: CalendarModule) {
  if (Platform.OS === 'ios') {
    try {
      return Calendar.getDefaultCalendarSync();
    } catch {
      const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);

      return calendars.find((calendar) => calendar.allowsModifications);
    }
  }

  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);

  return (
    calendars.find((calendar) => calendar.allowsModifications && calendar.isPrimary) ??
    calendars.find((calendar) => calendar.allowsModifications)
  );
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
  const date = new Date(value.trim());

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

export async function addPlanToCalendar(input: CalendarPlanInput): Promise<AddPlanToCalendarResult> {
  if (Platform.OS === 'web') {
    return {
      message: 'Calendar export needs a native development build. Copy the plan instead.',
      status: 'unavailable',
    };
  }

  try {
    const Calendar = await import('expo-calendar');
    const permission = await Calendar.requestCalendarPermissions();

    if (!isPermissionGranted(permission)) {
      return {
        message: 'Calendar permission was not granted. Copy the plan instead.',
        status: 'permission_denied',
      };
    }

    const calendar = await getWritableCalendar(Calendar);

    if (!calendar) {
      return {
        message: 'No writable calendar is available on this device. Copy the plan instead.',
        status: 'unavailable',
      };
    }

    const result = await calendar.addEventWithForm({
      endDate: input.endDate,
      location: input.locationText,
      notes: buildCalendarEventNotes(input),
      startDate: input.startDate,
      title: `Plan Roulette: ${input.planTitle}`,
      url: input.shareLink,
    });

    if (isCanceledAction(result.action)) {
      return {
        message: 'Calendar event was not added.',
        status: 'canceled',
      };
    }

    return {
      message: 'Calendar event ready.',
      status: 'created',
    };
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : 'Calendar export is unavailable. Copy the plan instead.',
      status: 'unavailable',
    };
  }
}
