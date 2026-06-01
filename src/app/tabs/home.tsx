// src/app/tabs/home.tsx
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Chip, EmptyState, ErrorState, LoadingState, Screen, Text } from '../../components';
import { theme } from '../../constants/theme';
import { useAuth } from '../../features/auth/AuthProvider';
import { formatRelativeDate, sortByTimestampDesc } from '../../lib/dateUtils';
import { getRecentRooms, isActiveRoomStatus, type RecentRoom } from '../../lib/recentRooms';
import { supabase } from '../../lib/supabase';
import type { ParticipantRole, RoomStatus } from '../../types/domain';
import { toDisplayLabel } from '../../utils/displayLabels';

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
  return toDisplayLabel(value);
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

function getStatusRailColor(status: RoomStatus) {
  if (status === 'voting') {
    return theme.colors.goGreen;
  }

  if (status === 'deciding') {
    return theme.colors.electricTangerine;
  }

  return theme.colors.poolBlue;
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
  return sortByTimestampDesc(rooms, (room) => room.lastTouchedAt);
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
      if (!session?.user) {
        const localActiveRooms = (await getRecentRooms()).filter((room) => isActiveRoomStatus(room.status)).map(toLocalActiveRoom);

        setActiveRooms(sortActiveRooms(localActiveRooms));
        return;
      }

      const [
        localActiveRooms,
        { data: participantData, error: participantError },
      ] = await Promise.all([
        getRecentRooms().then((rooms) => rooms.filter((room) => isActiveRoomStatus(room.status)).map(toLocalActiveRoom)),
        supabase
          .from('plan_participants')
          .select('room_id, role, joined_at')
          .eq('user_id', session.user.id)
          .order('joined_at', { ascending: false })
          .limit(40),
      ]);

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
      const serverRoomIds = new Set(serverRooms.map((room) => room.id));
      const mergedRooms = isGuest
        ? [...serverRooms, ...localActiveRooms.filter((localRoom) => !serverRoomIds.has(localRoom.id))]
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
      <Card style={styles.heroCard} variant="elevated">
        <View style={styles.heroTopRow}>
          <Chip title={accountState === 'guest' ? 'Guest workspace' : 'Signed in'} tone={accountState === 'guest' ? 'yellow' : 'green'} />
          <Button onPress={() => router.push('/create')} title="Create" variant="secondary" />
        </View>
        <View style={styles.heroCopy}>
          <Text variant="display">Plan Roulette</Text>
          <Text color="textSecondary">
            {accountState === 'guest'
              ? 'Re-open guest rooms on this device and keep the next decision moving.'
              : 'Jump back into live plans and close the loop with your group.'}
          </Text>
        </View>
        <View style={styles.heroMetrics}>
          <View style={styles.metricItem}>
            <Text style={styles.metricValue} variant="title">
              {activeRooms.length}
            </Text>
            <Text color="textSecondary" variant="caption">
              active
            </Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricValue} variant="title">
              {isGuest ? 'Local' : 'Cloud'}
            </Text>
            <Text color="textSecondary" variant="caption">
              sync
            </Text>
          </View>
        </View>
      </Card>

      {homeError ? <ErrorState message={homeError.message} onRetry={loadActiveRooms} retryLabel="Retry" title={homeError.title} /> : null}

      {activeRooms.length === 0 ? (
        <EmptyState
          action={<Button onPress={() => router.push('/create')} title="Create a plan" />}
          message="Create a room or join an invite to see active plans here."
          title="No active plans"
        />
      ) : (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="subtitle">Active Plans</Text>
            <Text color="textSecondary" variant="caption">
              {activeRooms.length} open
            </Text>
          </View>
          <View style={styles.roomList}>
            {activeRooms.map((room) => (
              <Card
                accessibilityLabel={`Open ${room.title}`}
                key={room.id}
                onPress={() => router.push(`/room/${room.id}`)}
                style={styles.roomCard}
                variant="elevated"
              >
                <View style={[styles.statusRail, { backgroundColor: getStatusRailColor(room.status) }]} />
                <View style={styles.roomContent}>
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
  heroCopy: {
    gap: theme.spacing.sm,
  },
  heroMetrics: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    padding: theme.spacing.md,
  },
  heroTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  metricDivider: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.border,
    width: 1,
  },
  metricItem: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  metricValue: {
    fontVariant: ['tabular-nums'],
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
});
