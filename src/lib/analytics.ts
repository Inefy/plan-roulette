// src/lib/analytics.ts
import { supabase } from './supabase';
import type { AnalyticsEventName } from '../types/domain';

type AnalyticsPropertyKey =
  | 'accountState'
  | 'budgetTier'
  | 'categoryCount'
  | 'decisionMode'
  | 'method'
  | 'optionCount'
  | 'participantCount'
  | 'resultStatus'
  | 'roomStatus'
  | 'source';

type AnalyticsPropertyValue = boolean | number | string | null | undefined;

export type AnalyticsProperties = Partial<Record<AnalyticsPropertyKey, AnalyticsPropertyValue>>;

type TrackAnalyticsEventInput = {
  name: AnalyticsEventName;
  optionId?: string;
  participantId?: string;
  properties?: AnalyticsProperties;
  roomId?: string;
};

const allowedPropertyKeys = new Set<AnalyticsPropertyKey>([
  'accountState',
  'budgetTier',
  'categoryCount',
  'decisionMode',
  'method',
  'optionCount',
  'participantCount',
  'resultStatus',
  'roomStatus',
  'source',
]);

const allowedStringValuesByKey: Partial<Record<AnalyticsPropertyKey, readonly string[]>> = {
  accountState: ['guest', 'loading', 'signed_in', 'signed_out'],
  budgetTier: ['free', 'high', 'low', 'moderate', 'splurge'],
  decisionMode: ['consensus', 'host_pick', 'majority'],
  method: ['copy_link', 'native_share'],
  resultStatus: ['cancelled', 'completed', 'decided', 'deciding', 'draft', 'expired', 'inviting', 'itinerary_ready', 'no_consensus', 'pending', 'tie', 'voting', 'winner_selected'],
  roomStatus: ['cancelled', 'completed', 'decided', 'deciding', 'draft', 'expired', 'inviting', 'itinerary_ready', 'voting'],
  source: ['itinerary', 'result'],
};

let cachedAnalyticsUserId: string | undefined;

function sanitizeAnalyticsProperties(properties: AnalyticsProperties | undefined) {
  const sanitizedProperties: Record<string, boolean | number | string | null> = {};

  for (const [key, value] of Object.entries(properties ?? {}) as [AnalyticsPropertyKey, AnalyticsPropertyValue][]) {
    if (!allowedPropertyKeys.has(key) || value === undefined) {
      continue;
    }

    if (typeof value === 'string') {
      if (allowedStringValuesByKey[key]?.includes(value)) {
        sanitizedProperties[key] = value;
      }
      continue;
    }

    if (typeof value === 'number') {
      sanitizedProperties[key] = Number.isFinite(value) ? value : 0;
      continue;
    }

    sanitizedProperties[key] = value;
  }

  return sanitizedProperties;
}

async function getAnalyticsUserId() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    return cachedAnalyticsUserId;
  }

  cachedAnalyticsUserId = data.session?.user.id;

  return cachedAnalyticsUserId;
}

async function insertAnalyticsEvent(input: TrackAnalyticsEventInput) {
  try {
    const userId = await getAnalyticsUserId();

    if (!userId) {
      return;
    }

    const { error } = await supabase.from('analytics_events').insert({
      name: input.name,
      option_id: input.optionId ?? null,
      participant_id: input.participantId ?? null,
      properties: sanitizeAnalyticsProperties(input.properties),
      room_id: input.roomId ?? null,
      user_id: userId,
    });

    if (error) {
      console.warn('Unable to track analytics event.', error.message);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.warn('Unable to track analytics event.', error.message);
    }
  }
}

export function trackAnalyticsEvent(input: TrackAnalyticsEventInput) {
  void insertAnalyticsEvent(input);
}
