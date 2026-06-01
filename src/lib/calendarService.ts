// src/lib/calendarService.ts
import { Platform } from 'react-native';
import type * as ExpoCalendar from 'expo-calendar';

import { buildCalendarEventNotes } from './calendarUtils';
import type { CalendarPlanInput } from './calendarUtils';

type CalendarModule = typeof ExpoCalendar;

export type AddPlanToCalendarStatus = 'canceled' | 'created' | 'permission_denied' | 'unavailable';

export type AddPlanToCalendarResult = {
  message: string;
  status: AddPlanToCalendarStatus;
};

export {
  buildCalendarEventNotes,
  formatCalendarDateInput,
  getDefaultCalendarDateRange,
  parseCalendarDateInput,
} from './calendarUtils';
export type { CalendarPlanInput } from './calendarUtils';

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
