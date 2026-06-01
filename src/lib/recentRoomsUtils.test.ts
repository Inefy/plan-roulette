/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getRoomHistoryDestination,
  isActiveRoomStatus,
  isClosedRoomStatus,
  mergeRecentRoom,
  normalizeRecentRooms,
} from './recentRoomsUtils';

test('normalizes recent rooms by filtering malformed records and invalid timestamps', () => {
  const rooms = normalizeRecentRooms([
    {
      id: ' room-1 ',
      lastOpenedAt: '2026-06-01T18:00:00.000Z',
      status: 'voting',
      title: ' Friday plan ',
      updatedAt: '2026-06-01T18:05:00.000Z',
    },
    {
      id: 'room-2',
      lastOpenedAt: 'not-a-date',
      status: 'voting',
      title: 'Broken date',
      updatedAt: '2026-06-01T18:05:00.000Z',
    },
    {
      id: 'room-3',
      lastOpenedAt: '2026-06-01T18:00:00.000Z',
      status: 'not-real',
      title: 'Broken status',
      updatedAt: '2026-06-01T18:05:00.000Z',
    },
  ]);

  assert.deepEqual(rooms, [
    {
      id: 'room-1',
      itineraryId: null,
      lastOpenedAt: '2026-06-01T18:00:00.000Z',
      status: 'voting',
      title: 'Friday plan',
      updatedAt: '2026-06-01T18:05:00.000Z',
    },
  ]);
});

test('normalizes recent rooms by newest room and removes duplicates', () => {
  const rooms = normalizeRecentRooms([
    {
      id: 'room-1',
      lastOpenedAt: '2026-06-01T18:00:00.000Z',
      status: 'voting',
      title: 'Older duplicate',
      updatedAt: '2026-06-01T18:00:00.000Z',
    },
    {
      id: 'room-2',
      lastOpenedAt: '2026-06-02T18:00:00.000Z',
      status: 'completed',
      title: 'Newest room',
      updatedAt: '2026-06-02T18:00:00.000Z',
    },
    {
      id: 'room-1',
      lastOpenedAt: '2026-06-03T18:00:00.000Z',
      status: 'decided',
      title: 'Newer duplicate',
      updatedAt: '2026-06-03T18:00:00.000Z',
    },
  ]);

  assert.equal(rooms.length, 2);
  assert.equal(rooms[0].id, 'room-1');
  assert.equal(rooms[0].title, 'Newer duplicate');
  assert.equal(rooms[1].id, 'room-2');
});

test('merges a remembered room over stale existing data', () => {
  const rooms = mergeRecentRoom(
    {
      id: 'room-1',
      status: 'itinerary_ready',
      title: 'Final plan',
      updatedAt: '2026-06-02T18:30:00.000Z',
    },
    [
      {
        id: 'room-1',
        itineraryId: null,
        lastOpenedAt: '2026-06-01T18:00:00.000Z',
        status: 'voting',
        title: 'Old title',
        updatedAt: '2026-06-01T18:00:00.000Z',
      },
    ],
    '2026-06-02T18:45:00.000Z',
  );

  assert.deepEqual(rooms, [
    {
      id: 'room-1',
      itineraryId: null,
      lastOpenedAt: '2026-06-02T18:45:00.000Z',
      status: 'itinerary_ready',
      title: 'Final plan',
      updatedAt: '2026-06-02T18:30:00.000Z',
    },
  ]);
});

test('classifies active and closed room status groups', () => {
  assert.equal(isActiveRoomStatus('voting'), true);
  assert.equal(isActiveRoomStatus('completed'), false);
  assert.equal(isClosedRoomStatus('completed'), true);
  assert.equal(isClosedRoomStatus('inviting'), false);
});

test('builds history destinations from itinerary availability', () => {
  assert.equal(getRoomHistoryDestination({ id: 'room-1', itineraryId: 'itinerary-1', status: 'decided' }), '/room/room-1/itinerary');
  assert.equal(getRoomHistoryDestination({ id: 'room-1', itineraryId: null, status: 'decided' }), '/room/room-1/result');
  assert.equal(getRoomHistoryDestination({ id: 'room-1', status: 'completed' }), '/room/room-1/itinerary');
});
