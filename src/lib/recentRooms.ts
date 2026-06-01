// src/lib/recentRooms.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

import { mergeRecentRoom, normalizeRecentRooms } from './recentRoomsUtils';
import type { RecentRoomInput } from './recentRoomsUtils';
export { getRoomHistoryDestination, isActiveRoomStatus, isClosedRoomStatus } from './recentRoomsUtils';
export type { RecentRoom, RecentRoomInput } from './recentRoomsUtils';

const recentRoomsStorageKey = 'plan-roulette:recent-rooms';

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

  return normalizeRecentRooms(parsedValue);
}

export async function rememberRecentRoom(input: RecentRoomInput) {
  const existingRooms = await getRecentRooms();
  const nextRooms = mergeRecentRoom(input, existingRooms);
  const nextRoom = nextRooms[0];

  if (!nextRoom) {
    throw new Error('Recent room is missing a valid id, title, or timestamp.');
  }

  await AsyncStorage.setItem(recentRoomsStorageKey, JSON.stringify(nextRooms));

  return nextRoom;
}
