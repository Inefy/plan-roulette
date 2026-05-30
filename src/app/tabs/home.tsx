// src/app/tabs/home.tsx
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Chip, EmptyState, ErrorState, LoadingState, Screen, Text } from '../../components';
import { theme } from '../../constants/theme';
import { useAuth } from '../../features/auth/AuthProvider';
import { getRecentRooms, isActiveRoomStatus, type RecentRoom } from '../../lib/recentRooms';
import { supabase } from '../../lib/supabase';
import type { ParticipantRole, RoomStatus } from '../../types/domain';

type ParticipantRoomRow = {
  joined_at: string;
  role: ParticipantRole;
  room_id: string;
};

type RoomRow = {
  created_at: string;
  id: string;
  itinerary_id: string | null;
  status: RoomStatus;
  title: string;
  updated_at: string;
};

type ActiveRoomItem = {
  id: string;
  lastTouchedAt: string;
  role?: ParticipantRole;
  status: RoomStatus;
  title: string;
};

type HomeError = {
  message: string;
  title: string;
};

const activeStatuses: readonly RoomStatus[] = ['draft', 'inviting', 'voting', 'deciding'];

function toLabel(value: string) {
  return value
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getStatusTone(status: RoomStatus) {
  if (status === 'voting') {
    return 'green';
  }

  if (status === 'deciding') {
    return 'orange';
  }

  return 'blue';
}

function formatRelativeDate(value: string) {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return 'Recently updated';
  }

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));

  if (elapsedMinutes < 1) {
    return 'Updated just now';
  }

  if (elapsedMinutes < 60) {
    return `Updated ${elapsedMinutes} min ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return `Updated ${elapsedHours} hr ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);

  return `Updated ${elapsedDays} day${elapsedDays === 1 ? '' : 's'} ago`;
}

function toActiveRoomItem(room: RoomRow, participant?: ParticipantRoomRow): ActiveRoomItem {
  return {
    id: room.id,
    lastTouchedAt: room.updated_at ?? room.created_at,
    role: participant?.role,
    status: room.status,
    title: room.title,
  };
}

function toLocalActiveRoom(room: RecentRoom): ActiveRoomItem {
  return {
    id: room.id,
    lastTouchedAt: room.lastOpenedAt,
    status: room.status,
    title: room.title,
  };
}

function sortActiveRooms(rooms: readonly ActiveRoomItem[]) {
  return [...rooms].sort((left, right) => Date.parse(right.lastTouchedAt) - Date.parse(left.lastTouchedAt));
}

export default function HomeRoute() {
  const router = useRouter();
  const { accountState, isGuest, isLoading: isAuthLoading, session } = useAuth();
  const [activeRooms, setActiveRooms] = useState<ActiveRoomItem[]>([]);
  const [homeError, setHomeError] = useState<HomeError | undefined>();
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);

  const loadActiveRooms = useCallback(async () => {
    if (isAuthLoading) {
      return;
    }

    setHomeError(undefined);
    setIsLoadingRooms(true);

    try {
      const localActiveRooms = (await getRecentRooms()).filter((room) => isActiveRoomStatus(room.status)).map(toLocalActiveRoom);

      if (!session?.user) {
        setActiveRooms(sortActiveRooms(localActiveRooms));
        return;
      }

      const { data: participantData, error: participantError } = await supabase
        .from('plan_participants')
        .select('room_id, role, joined_at')
        .eq('user_id', session.user.id)
        .order('joined_at', { ascending: false })
        .limit(40);

      if (participantError) {
        throw new Error(participantError.message);
      }

      const participantRows = (participantData ?? []) as ParticipantRoomRow[];
      const roomIds = [...new Set(participantRows.map((participant) => participant.room_id))];

      if (roomIds.length === 0) {
        setActiveRooms(isGuest ? sortActiveRooms(localActiveRooms) : []);
        return;
      }

      const { data: roomData, error: roomError } = await supabase
        .from('plan_rooms')
        .select('id, title, status, itinerary_id, created_at, updated_at')
        .in('id', roomIds)
        .in('status', [...activeStatuses]);

      if (roomError) {
        throw new Error(roomError.message);
      }

      const participantsByRoomId = new Map(participantRows.map((participant) => [participant.room_id, participant]));
      const serverRooms = ((roomData ?? []) as RoomRow[]).map((room) => toActiveRoomItem(room, participantsByRoomId.get(room.id)));
      const mergedRooms = isGuest
        ? [...serverRooms, ...localActiveRooms.filter((localRoom) => !serverRooms.some((serverRoom) => serverRoom.id === localRoom.id))]
        : serverRooms;

      setActiveRooms(sortActiveRooms(mergedRooms));
    } catch (error) {
      setHomeError({
        message: error instanceof Error ? error.message : 'Unable to load active rooms.',
        title: 'Unable to load plans',
      });
    } finally {
      setIsLoadingRooms(false);
    }
  }, [isAuthLoading, isGuest, session]);

  useFocusEffect(
    useCallback(() => {
      loadActiveRooms();
    }, [loadActiveRooms]),
  );

  if (isAuthLoading || isLoadingRooms) {
    return (
      <Screen centered>
        <LoadingState message="Loading active plans..." />
      </Screen>
    );
  }

  return (
    <Screen contentContainerStyle={styles.screen} padded={false} scroll>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text variant="title">Home</Text>
          <Text color="textSecondary">
            {accountState === 'guest' ? 'Guest rooms stay easy to re-open on this device.' : 'Jump back into plans that are still in progress.'}
          </Text>
        </View>
        <Button onPress={() => router.push('/create')} title="Create" variant="secondary" />
      </View>

      {homeError ? <ErrorState message={homeError.message} onRetry={loadActiveRooms} retryLabel="Retry" title={homeError.title} /> : null}

      {activeRooms.length === 0 ? (
        <EmptyState
          action={<Button onPress={() => router.push('/create')} title="Create a plan" />}
          message="Create a room or join an invite to see active plans here."
          title="No active plans"
        />
      ) : (
        <View style={styles.roomList}>
          {activeRooms.map((room) => (
            <Card accessibilityLabel={`Open ${room.title}`} key={room.id} onPress={() => router.push(`/room/${room.id}`)} style={styles.roomCard}>
              <View style={styles.roomHeader}>
                <View style={styles.roomTitleGroup}>
                  <Text variant="bodyStrong">{room.title}</Text>
                  <Text color="textSecondary" variant="caption">
                    {formatRelativeDate(room.lastTouchedAt)}
                  </Text>
                </View>
                <Chip title={toLabel(room.status)} tone={getStatusTone(room.status)} />
              </View>
              <View style={styles.roomFooter}>
                <Text color="textSecondary" variant="caption">
                  {room.role ? `You are ${toLabel(room.role)}` : 'Recent guest room'}
                </Text>
                <Text color="textSecondary" variant="caption">
                  Tap to open
                </Text>
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  roomCard: {
    gap: theme.spacing.md,
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
  titleGroup: {
    flex: 1,
    gap: theme.spacing.xs,
  },
});
