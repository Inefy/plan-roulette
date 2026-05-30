// src/app/tabs/history.tsx
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Chip, EmptyState, ErrorState, LoadingState, Screen, Text } from '../../components';
import { theme } from '../../constants/theme';
import { useAuth } from '../../features/auth/AuthProvider';
import { getRecentRooms, getRoomHistoryDestination, isClosedRoomStatus, type RecentRoom } from '../../lib/recentRooms';
import { supabase } from '../../lib/supabase';
import type { RoomStatus } from '../../types/domain';

type ParticipantRoomRow = {
  joined_at: string;
  room_id: string;
};

type SavedRoomRow = {
  created_at: string;
  room_id: string;
  updated_at: string;
};

type RoomRow = {
  created_at: string;
  id: string;
  itinerary_id: string | null;
  status: RoomStatus;
  title: string;
  updated_at: string;
};

type HistoryRoomItem = {
  id: string;
  itineraryId?: string | null;
  lastTouchedAt: string;
  savedAt?: string;
  status: RoomStatus;
  title: string;
};

type HistoryError = {
  message: string;
  title: string;
};

const closedStatuses: readonly RoomStatus[] = ['decided', 'itinerary_ready', 'completed', 'cancelled', 'expired'];

function toLabel(value: string) {
  return value
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getStatusTone(status: RoomStatus) {
  if (status === 'itinerary_ready' || status === 'completed') {
    return 'green';
  }

  if (status === 'cancelled' || status === 'expired') {
    return 'red';
  }

  return 'orange';
}

function getStatusRailColor(status: RoomStatus) {
  if (status === 'itinerary_ready' || status === 'completed') {
    return theme.colors.goGreen;
  }

  if (status === 'cancelled' || status === 'expired') {
    return theme.colors.nopeCoral;
  }

  return theme.colors.electricTangerine;
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Recently';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function sortHistoryItems(items: readonly HistoryRoomItem[]) {
  return [...items].sort((left, right) => Date.parse(right.lastTouchedAt) - Date.parse(left.lastTouchedAt));
}

function toLocalHistoryItem(room: RecentRoom): HistoryRoomItem {
  return {
    id: room.id,
    itineraryId: room.itineraryId,
    lastTouchedAt: room.lastOpenedAt,
    status: room.status,
    title: room.title,
  };
}

function toHistoryItem(room: RoomRow, savedRoom?: SavedRoomRow, participant?: ParticipantRoomRow): HistoryRoomItem {
  return {
    id: room.id,
    itineraryId: room.itinerary_id,
    lastTouchedAt: savedRoom?.updated_at ?? room.updated_at ?? participant?.joined_at ?? room.created_at,
    savedAt: savedRoom?.updated_at,
    status: room.status,
    title: room.title,
  };
}

export default function HistoryRoute() {
  const router = useRouter();
  const { accountState, isLoading: isAuthLoading, session } = useAuth();
  const [historyError, setHistoryError] = useState<HistoryError | undefined>();
  const [historyItems, setHistoryItems] = useState<HistoryRoomItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const loadLocalHistory = useCallback(async () => {
    const localRooms = await getRecentRooms();
    const localHistory = localRooms.filter((room) => isClosedRoomStatus(room.status)).map(toLocalHistoryItem);

    setHistoryItems(sortHistoryItems(localHistory));
  }, []);

  const loadSignedInHistory = useCallback(async () => {
    if (!session?.user) {
      await loadLocalHistory();
      return;
    }

    const [{ data: participantData, error: participantError }, { data: savedRoomData, error: savedRoomError }] = await Promise.all([
      supabase
        .from('plan_participants')
        .select('room_id, joined_at')
        .eq('user_id', session.user.id)
        .order('joined_at', { ascending: false })
        .limit(60),
      supabase
        .from('saved_rooms')
        .select('room_id, created_at, updated_at')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false })
        .limit(60),
    ]);

    if (participantError) {
      throw new Error(participantError.message);
    }

    if (savedRoomError) {
      throw new Error(savedRoomError.message);
    }

    const participantRows = (participantData ?? []) as ParticipantRoomRow[];
    const savedRows = (savedRoomData ?? []) as SavedRoomRow[];
    const savedRoomsByRoomId = new Map(savedRows.map((savedRoom) => [savedRoom.room_id, savedRoom]));
    const participantsByRoomId = new Map(participantRows.map((participant) => [participant.room_id, participant]));
    const roomIds = [...new Set([...participantRows.map((participant) => participant.room_id), ...savedRows.map((savedRoom) => savedRoom.room_id)])];

    if (roomIds.length === 0) {
      setHistoryItems([]);
      return;
    }

    const { data: roomData, error: roomError } = await supabase
      .from('plan_rooms')
      .select('id, title, status, itinerary_id, created_at, updated_at')
      .in('id', roomIds)
      .in('status', [...closedStatuses]);

    if (roomError) {
      throw new Error(roomError.message);
    }

    const items = ((roomData ?? []) as RoomRow[]).map((room) => toHistoryItem(room, savedRoomsByRoomId.get(room.id), participantsByRoomId.get(room.id)));

    setHistoryItems(sortHistoryItems(items));
  }, [loadLocalHistory, session]);

  const loadHistory = useCallback(async () => {
    if (isAuthLoading) {
      return;
    }

    setHistoryError(undefined);
    setIsLoadingHistory(true);

    try {
      if (accountState === 'signed_in') {
        await loadSignedInHistory();
      } else {
        await loadLocalHistory();
      }
    } catch (error) {
      setHistoryError({
        message: error instanceof Error ? error.message : 'Unable to load room history.',
        title: 'Unable to load history',
      });
    } finally {
      setIsLoadingHistory(false);
    }
  }, [accountState, isAuthLoading, loadLocalHistory, loadSignedInHistory]);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory]),
  );

  if (isAuthLoading || isLoadingHistory) {
    return (
      <Screen centered>
        <LoadingState message="Loading history..." />
      </Screen>
    );
  }

  return (
    <Screen contentContainerStyle={styles.screen} padded={false} scroll>
      <Card style={styles.heroCard} variant="elevated">
        <View style={styles.heroTopRow}>
          <Chip title={accountState === 'signed_in' ? 'Account history' : 'Local history'} tone={accountState === 'signed_in' ? 'green' : 'yellow'} />
          <Button onPress={loadHistory} title="Refresh" variant="outline" />
        </View>
        <View style={styles.titleGroup}>
          <Text variant="display">History</Text>
          <Text color="textSecondary">
            {accountState === 'signed_in' ? 'Recent closed rooms from your account.' : 'Recent guest rooms saved on this device.'}
          </Text>
        </View>
      </Card>

      {historyError ? <ErrorState message={historyError.message} onRetry={loadHistory} retryLabel="Retry" title={historyError.title} /> : null}

      {historyItems.length === 0 ? (
        <EmptyState
          message={accountState === 'signed_in' ? 'Closed rooms will appear here after voting ends.' : 'Open a room as a guest and it will appear here after it closes.'}
          title="No history"
        />
      ) : (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="subtitle">Closed Plans</Text>
            <Text color="textSecondary" variant="caption">
              {historyItems.length} saved
            </Text>
          </View>
          <View style={styles.roomList}>
            {historyItems.map((room) => (
              <Card
                accessibilityLabel={`Open history for ${room.title}`}
                key={room.id}
                onPress={() => router.push(getRoomHistoryDestination(room))}
                style={styles.roomCard}
                variant="elevated"
              >
                <View style={[styles.statusRail, { backgroundColor: getStatusRailColor(room.status) }]} />
                <View style={styles.roomContent}>
                  <View style={styles.roomHeader}>
                    <View style={styles.roomTitleGroup}>
                      <Text variant="bodyStrong">{room.title}</Text>
                      <Text color="textSecondary" variant="caption">
                        {room.savedAt ? `Saved ${formatDate(room.savedAt)}` : `Closed ${formatDate(room.lastTouchedAt)}`}
                      </Text>
                    </View>
                    <Chip title={toLabel(room.status)} tone={getStatusTone(room.status)} />
                  </View>
                  <View style={styles.roomFooter}>
                    <Text color="textSecondary" variant="caption">
                      {room.itineraryId || room.status === 'itinerary_ready' || room.status === 'completed' ? 'Opens itinerary' : 'Opens result'}
                    </Text>
                    <Text color="textSecondary" variant="caption">
                      Open
                    </Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    gap: theme.spacing.xl,
  },
  heroTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  roomContent: {
    flex: 1,
    gap: theme.spacing.md,
  },
  roomCard: {
    flexDirection: 'row',
    gap: theme.spacing.lg,
    overflow: 'hidden',
  },
  roomFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  roomHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  roomList: {
    gap: theme.spacing.md,
  },
  roomTitleGroup: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  screen: {
    gap: theme.spacing.xl,
    padding: theme.spacing.xl,
  },
  section: {
    gap: theme.spacing.md,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusRail: {
    borderRadius: theme.radius.pill,
    width: 5,
  },
  titleGroup: {
    flex: 1,
    gap: theme.spacing.xs,
  },
});
