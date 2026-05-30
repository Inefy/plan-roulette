// src/lib/recentRooms.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { RoomStatus } from '../types/domain';

export type RecentRoom = {
  id: string;
  itineraryId?: string | null;
  lastOpenedAt: string;
  status: RoomStatus;
  title: string;
  updatedAt: string;
};

type RecentRoomInput = {
  id: string;
  itineraryId?: string | null;
  status: RoomStatus;
  title: string;
  updatedAt?: string | null;
};

const recentRoomsStorageKey = 'plan-roulette:recent-rooms';
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

function parseRecentRoom(value: unknown): RecentRoom | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string' || !isRoomStatus(value.status)) {
    return undefined;
  }

  const lastOpenedAt = typeof value.lastOpenedAt === 'string' ? value.lastOpenedAt : undefined;
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : lastOpenedAt;

  if (!lastOpenedAt || !updatedAt) {
    return undefined;
  }

  return {
    id: value.id,
    itineraryId: typeof value.itineraryId === 'string' ? value.itineraryId : null,
    lastOpenedAt,
    status: value.status,
    title: value.title,
    updatedAt,
  };
}

function sortRecentRooms(rooms: readonly RecentRoom[]) {
  return [...rooms].sort((left, right) => Date.parse(right.lastOpenedAt) - Date.parse(left.lastOpenedAt));
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

export async function getRecentRooms() {
  const rawValue = await AsyncStorage.getItem(recentRoomsStorageKey);

  if (!rawValue) {
    return [];
  }

  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(rawValue);
  } catch {
    return [];
  }

  if (!Array.isArray(parsedValue)) {
    return [];
  }

  return sortRecentRooms(parsedValue.map(parseRecentRoom).filter((room): room is RecentRoom => Boolean(room)));
}

export async function rememberRecentRoom(input: RecentRoomInput) {
  const now = new Date().toISOString();
  const existingRooms = await getRecentRooms();
  const nextRoom: RecentRoom = {
    id: input.id,
    itineraryId: input.itineraryId ?? null,
    lastOpenedAt: now,
    status: input.status,
    title: input.title,
    updatedAt: input.updatedAt ?? now,
  };
  const nextRooms = sortRecentRooms([nextRoom, ...existingRooms.filter((room) => room.id !== input.id)]).slice(0, maxRecentRooms);

  await AsyncStorage.setItem(recentRoomsStorageKey, JSON.stringify(nextRooms));

  return nextRoom;
}
