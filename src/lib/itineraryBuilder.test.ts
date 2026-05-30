// src/lib/itineraryBuilder.test.ts
/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';

import type { PlanParticipant, PlanRoom } from '../types/domain';
import { buildItinerary, type ItineraryWinningOption } from './itineraryBuilder';

const room: PlanRoom = {
  constraints: {
    budgetTier: 'low',
    categoryPreferences: ['food'],
    energyLevel: 'low',
    locationMode: 'in_person',
    planningEffort: 'light',
    startsAt: '2026-06-01T18:00:00.000Z',
    weatherMode: 'indoor',
  },
  createdAt: '2026-05-30T00:00:00.000Z',
  decisionMode: 'consensus',
  hostUserId: 'user-1',
  id: 'room-1',
  inviteToken: 'invite-token',
  optionIds: ['option-1'],
  participantIds: ['participant-1', 'participant-2'],
  status: 'decided',
  title: 'Friday plan',
  updatedAt: '2026-05-30T00:00:00.000Z',
};

const participants: PlanParticipant[] = [
  {
    displayName: 'Ari',
    id: 'participant-1',
    isReady: true,
    joinedAt: '2026-05-30T00:00:00.000Z',
    role: 'host',
    roomId: 'room-1',
    userId: 'user-1',
  },
  {
    displayName: 'Bea',
    id: 'participant-2',
    isReady: true,
    joinedAt: '2026-05-30T00:00:00.000Z',
    role: 'guest',
    roomId: 'room-1',
  },
];

test('builds share text with core itinerary details', () => {
  const option: ItineraryWinningOption = {
    backupPlan: 'Order takeout bowls if the line is too long.',
    budgetTier: 'low',
    category: 'food',
    description: 'Casual dinner with flexible ordering.',
    duration: { maxMinutes: 90, minMinutes: 45 },
    id: 'option-1',
    locationLabel: 'Harbor Tacos',
    shareSummary: 'Taco run with quick service and flexible order choices.',
    title: 'Shared Taco Run',
  };

  const itinerary = buildItinerary(option, room, participants);

  assert.match(itinerary.shareText, /Plan Roulette picked Shared Taco Run\./);
  assert.match(itinerary.shareText, /Meet: 2026-06-01T18:00:00\.000Z\./);
  assert.match(itinerary.shareText, /Where: Harbor Tacos\./);
  assert.match(itinerary.shareText, /Budget: Low cost\./);
  assert.match(itinerary.shareText, /Duration: 45 min to 1 hr 30 min\./);
  assert.match(itinerary.shareText, /People: 2 participants: Ari, Bea\./);
});

test('uses category-specific steps for food plans', () => {
  const option: ItineraryWinningOption = {
    budgetTier: 'low',
    category: 'food',
    id: 'option-1',
    steps: ['Meet at the winner or order ahead.'],
    title: 'Shared Taco Run',
  };

  const itinerary = buildItinerary(option, room, participants);

  assert.ok(itinerary.steps.includes('Confirm dietary needs before ordering.'));
  assert.ok(itinerary.steps.includes('Pick a menu with flexible choices.'));
  assert.ok(itinerary.steps.includes('Meet at the winner or order ahead.'));
});

test('uses category-specific steps for hike plans and location-mode fallback language', () => {
  const hikeRoom: PlanRoom = {
    ...room,
    constraints: {
      ...room.constraints,
      categoryPreferences: ['hike'],
      locationMode: 'in_person',
      startsAt: undefined,
    },
  };
  const option: ItineraryWinningOption = {
    category: 'hike',
    id: 'option-2',
    locationMode: 'in_person',
    title: 'Easy Lookout Loop',
  };

  const itinerary = buildItinerary(option, hikeRoom, participants);

  assert.ok(itinerary.steps.includes('Check weather, daylight, and trail conditions.'));
  assert.equal(itinerary.locationText, 'Use an in-person spot for this trailhead or public outdoor route.');
});
