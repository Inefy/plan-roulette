import type { RoomStatus } from '../types/domain';
import { parseTimestamp, sortByTimestampDesc } from './dateUtils';

export type RecentRoom = {
  id: string;
  itineraryId?: string | null;
  lastOpenedAt: string;
  status: RoomStatus;
  title: string;
  updatedAt: string;
};

export type RecentRoomInput = {
  id: string;
  itineraryId?: string | null;
  status: RoomStatus;
  title: string;
  updatedAt?: string | null;
};

const maxRecentRooms = 20;
const roomStatuses: readonly RoomStatus[] = [
  'draft',
  'inviting',
  'voting',
  'deciding',
  'decided',
  'itinerary_ready',
  'completed',
  'cancelled',
  'expired',
];
const activeRoomStatuses: readonly RoomStatus[] = ['draft', 'inviting', 'voting', 'deciding'];
const closedRoomStatuses: readonly RoomStatus[] = ['decided', 'itinerary_ready', 'completed', 'cancelled', 'expired'];

function isRoomStatus(value: unknown): value is RoomStatus {
  return typeof value === 'string' && roomStatuses.includes(value as RoomStatus);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && parseTimestamp(value) !== undefined;
}

function normalizeOptionalItineraryId(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function parseRecentRoom(value: unknown): RecentRoom | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string' || !isRoomStatus(value.status)) {
    return undefined;
  }

  const id = value.id.trim();
  const title = value.title.trim();
  const lastOpenedAt = isValidTimestamp(value.lastOpenedAt) ? value.lastOpenedAt : undefined;
  const updatedAt = isValidTimestamp(value.updatedAt) ? value.updatedAt : lastOpenedAt;

  if (!id || !title || !lastOpenedAt || !updatedAt) {
    return undefined;
  }

  return {
    id,
    itineraryId: normalizeOptionalItineraryId(value.itineraryId),
    lastOpenedAt,
    status: value.status,
    title,
    updatedAt,
  };
}

export function sortRecentRooms(rooms: readonly RecentRoom[]) {
  return sortByTimestampDesc(rooms, (room) => room.lastOpenedAt);
}

export function normalizeRecentRooms(value: unknown, limit = maxRecentRooms) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenRoomIds = new Set<string>();
  const rooms: RecentRoom[] = [];

  for (const room of sortRecentRooms(value.map(parseRecentRoom).filter((candidate): candidate is RecentRoom => Boolean(candidate)))) {
    if (seenRoomIds.has(room.id)) {
      continue;
    }

    seenRoomIds.add(room.id);
    rooms.push(room);

    if (rooms.length >= limit) {
      break;
    }
  }

  return rooms;
}

export function createRecentRoom(input: RecentRoomInput, lastOpenedAt = new Date().toISOString()): RecentRoom {
  const title = input.title.trim() || 'Untitled plan';

  return {
    id: input.id.trim(),
    itineraryId: normalizeOptionalItineraryId(input.itineraryId),
    lastOpenedAt,
    status: input.status,
    title,
    updatedAt: input.updatedAt ?? lastOpenedAt,
  };
}

export function mergeRecentRoom(input: RecentRoomInput, existingRooms: readonly RecentRoom[], lastOpenedAt = new Date().toISOString()) {
  const normalizedRoomId = input.id.trim();

  return normalizeRecentRooms([createRecentRoom(input, lastOpenedAt), ...existingRooms.filter((room) => room.id !== normalizedRoomId)]);
}

export function isActiveRoomStatus(status: RoomStatus) {
  return activeRoomStatuses.includes(status);
}

export function isClosedRoomStatus(status: RoomStatus) {
  return closedRoomStatuses.includes(status);
}

export function getRoomHistoryDestination(room: Pick<RecentRoom, 'id' | 'itineraryId' | 'status'>) {
  if (room.itineraryId || room.status === 'itinerary_ready' || room.status === 'completed') {
    return `/room/${room.id}/itinerary`;
  }

  return `/room/${room.id}/result`;
}
