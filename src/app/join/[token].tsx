// src/app/join/[token].tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { Button, Card, Chip, ErrorState, LoadingState, Screen, Text } from '../../components';
import { theme } from '../../constants/theme';
import { useAuth } from '../../features/auth/AuthProvider';
import { trackAnalyticsEvent } from '../../lib/analytics';
import { getFriendlyRemoteError } from '../../lib/remoteErrors';
import { supabase } from '../../lib/supabase';
import { toDisplayLabel } from '../../utils/displayLabels';
import type {
  BudgetTier,
  DecisionMode,
  EnergyLevel,
  LocationMode,
  ParticipantRole,
  PlanningEffort,
  PlanCategory,
  RoomStatus,
  WeatherMode,
} from '../../types/domain';

type BlockedReason = 'closed_voting' | 'expired' | 'full';
type JoinErrorKind = 'auth' | 'closed_voting' | 'expired' | 'full' | 'invalid_token' | 'network';

type JoinRouteParams = {
  token?: string | string[];
};

type ResolvedRoomRpcRow = {
  already_joined: boolean;
  blocked_reason: BlockedReason | null;
  budget_tier: BudgetTier;
  can_join: boolean;
  category_preferences: PlanCategory[];
  decision_mode: DecisionMode;
  ends_at: string | null;
  energy_level: EnergyLevel;
  existing_participant_id: string | null;
  existing_role: ParticipantRole | null;
  expires_at: string | null;
  host_display_name: string;
  location_mode: LocationMode;
  max_participants: number | null;
  participant_count: number;
  planning_effort: PlanningEffort;
  room_id: string;
  starts_at: string | null;
  status: RoomStatus;
  title: string;
  weather_mode: WeatherMode;
};

type ResolvedRoom = {
  alreadyJoined: boolean;
  blockedReason?: BlockedReason;
  budgetTier: BudgetTier;
  canJoin: boolean;
  categoryPreferences: PlanCategory[];
  decisionMode: DecisionMode;
  endsAt?: string;
  energyLevel: EnergyLevel;
  existingParticipantId?: string;
  existingRole?: ParticipantRole;
  expiresAt?: string;
  hostDisplayName: string;
  locationMode: LocationMode;
  maxParticipants?: number;
  participantCount: number;
  planningEffort: PlanningEffort;
  roomId: string;
  startsAt?: string;
  status: RoomStatus;
  title: string;
  weatherMode: WeatherMode;
};

type JoinError = {
  kind: JoinErrorKind;
  message: string;
  retryable: boolean;
  title: string;
};

type JoinRoomRpcRow = {
  participant_id: string;
  role: ParticipantRole;
  room_id: string;
};

function getTokenValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function toLabel(value: string) {
  return toDisplayLabel(value);
}

function getDefaultDisplayName(session: Session) {
  const metadataName = session.user.user_metadata?.display_name;

  if (typeof metadataName === 'string' && metadataName.trim()) {
    return metadataName.trim();
  }

  if (session.user.email) {
    return session.user.email.split('@')[0];
  }

  return session.user.is_anonymous ? 'Guest planner' : 'Planner';
}

function parseResolvedRoom(value: unknown): ResolvedRoom | undefined {
  const rows = Array.isArray(value) ? value : [];
  const row = rows[0] as Partial<ResolvedRoomRpcRow> | undefined;

  if (!row?.room_id || !row.title) {
    return undefined;
  }

  return {
    alreadyJoined: Boolean(row.already_joined),
    blockedReason: row.blocked_reason ?? undefined,
    budgetTier: row.budget_tier as BudgetTier,
    canJoin: Boolean(row.can_join),
    categoryPreferences: Array.isArray(row.category_preferences) ? row.category_preferences : [],
    decisionMode: row.decision_mode as DecisionMode,
    endsAt: row.ends_at ?? undefined,
    energyLevel: row.energy_level as EnergyLevel,
    existingParticipantId: row.existing_participant_id ?? undefined,
    existingRole: row.existing_role ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    hostDisplayName: row.host_display_name ?? 'Host',
    locationMode: row.location_mode as LocationMode,
    maxParticipants: row.max_participants ?? undefined,
    participantCount: row.participant_count ?? 0,
    planningEffort: row.planning_effort as PlanningEffort,
    roomId: row.room_id,
    startsAt: row.starts_at ?? undefined,
    status: row.status as RoomStatus,
    title: row.title,
    weatherMode: row.weather_mode as WeatherMode,
  };
}

function parseJoinRoom(value: unknown): JoinRoomRpcRow {
  const rows = Array.isArray(value) ? value : [];
  const row = rows[0] as Partial<JoinRoomRpcRow> | undefined;

  if (!row?.room_id || !row.participant_id || !row.role) {
    throw new Error('Supabase did not return the joined room.');
  }

  return {
    participant_id: row.participant_id,
    role: row.role as ParticipantRole,
    room_id: row.room_id,
  };
}

function createInvalidTokenError(): JoinError {
  return {
    kind: 'invalid_token',
    message: 'This invite link does not match an active Plan Roulette room.',
    retryable: false,
    title: 'Invite not found',
  };
}

function createErrorFromMessage(message: string, action: 'join_room' | 'resolve_invite' = 'resolve_invite'): JoinError {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('not found') || normalizedMessage.includes('token')) {
    return createInvalidTokenError();
  }

  if (normalizedMessage.includes('expired')) {
    return {
      kind: 'expired',
      message: 'This invite has expired.',
      retryable: false,
      title: 'Invite expired',
    };
  }

  if (normalizedMessage.includes('closed') || normalizedMessage.includes('not accepting')) {
    return {
      kind: 'closed_voting',
      message: 'Voting is closed for this room.',
      retryable: false,
      title: 'Voting closed',
    };
  }

  if (normalizedMessage.includes('full')) {
    return {
      kind: 'full',
      message: 'This room is already full.',
      retryable: false,
      title: 'Room full',
    };
  }

  if (normalizedMessage.includes('authentication') || normalizedMessage.includes('sign in')) {
    return {
      kind: 'auth',
      message,
      retryable: true,
      title: 'Sign-in needed',
    };
  }

  const friendlyError = getFriendlyRemoteError(message, action, {
    message: message || 'Check your connection and try again.',
    retryable: true,
    title: action === 'join_room' ? 'Unable to join room' : 'Unable to reach room',
  });

  if (friendlyError.isOffline) {
    return {
      kind: 'network',
      message: friendlyError.message,
      retryable: friendlyError.retryable,
      title: friendlyError.title,
    };
  }

  return {
    kind: 'network',
    message: message || 'Check your connection and try again.',
    retryable: true,
    title: action === 'join_room' ? 'Unable to join room' : 'Unable to reach room',
  };
}

function createBlockedError(reason: BlockedReason): JoinError {
  if (reason === 'expired') {
    return createErrorFromMessage('expired');
  }

  if (reason === 'closed_voting') {
    return createErrorFromMessage('closed');
  }

  return createErrorFromMessage('full');
}

function getStatusLabel(room: ResolvedRoom) {
  if (room.alreadyJoined && room.canJoin) {
    return 'Already joined';
  }

  if (room.canJoin) {
    return room.status === 'voting' ? 'Voting open' : 'Inviting';
  }

  if (room.blockedReason === 'expired') {
    return 'Expired';
  }

  if (room.blockedReason === 'full') {
    return 'Full';
  }

  return 'Voting closed';
}

function getStatusDescription(room: ResolvedRoom) {
  if (room.alreadyJoined && room.canJoin) {
    return 'You are already in this room. Continue to voting when ready.';
  }

  if (room.canJoin) {
    return 'Join the room to vote on the generated options.';
  }

  if (room.blockedReason) {
    return createBlockedError(room.blockedReason).message;
  }

  return 'This room is not accepting new votes.';
}

function getStatusTone(room: ResolvedRoom) {
  if (room.alreadyJoined) {
    return 'green';
  }

  if (room.canJoin) {
    return 'blue';
  }

  return 'red';
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatTimeWindow(room: ResolvedRoom) {
  if (room.startsAt && room.endsAt) {
    return `${formatDateTime(room.startsAt)} to ${formatDateTime(room.endsAt)}`;
  }

  return 'Flexible time';
}

function formatParticipantLabel(room: ResolvedRoom) {
  if (room.maxParticipants) {
    return `${room.participantCount}/${room.maxParticipants} joined`;
  }

  return `${room.participantCount} joined`;
}

export default function JoinTokenRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<JoinRouteParams>();
  const token = useMemo(() => getTokenValue(params.token)?.trim(), [params.token]);
  const { errorMessage: authErrorMessage, isLoading: isAuthLoading, session, signInAnonymously } = useAuth();
  const trackedInviteOpenedRoomId = useRef<string | undefined>(undefined);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<JoinError | undefined>();
  const [isJoining, setIsJoining] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [room, setRoom] = useState<ResolvedRoom | undefined>();
  const [validationMessage, setValidationMessage] = useState<string | undefined>();

  const ensureAuthenticatedSession = useCallback(
    async (preferredDisplayName: string) => {
      if (session?.user) {
        return session;
      }

      await signInAnonymously(preferredDisplayName || 'Guest planner');

      const { data, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error(sessionError.message);
      }

      if (!data.session?.user) {
        throw new Error(authErrorMessage ?? 'Unable to start a guest session.');
      }

      return data.session;
    },
    [authErrorMessage, session, signInAnonymously],
  );

  useEffect(() => {
    let isMounted = true;

    async function resolveRoom() {
      if (!token) {
        setError(createInvalidTokenError());
        setRoom(undefined);
        return;
      }

      if (isAuthLoading) {
        return;
      }

      setError(undefined);
      setIsResolving(true);

      try {
        const { data, error: resolveError } = await supabase.rpc('resolve_room_by_token', {
          p_invite_token: token,
        });

        if (!isMounted) {
          return;
        }

        if (resolveError) {
          throw new Error(resolveError.message);
        }

        if (session?.user) {
          setDisplayName((currentDisplayName) => currentDisplayName || getDefaultDisplayName(session));
        }

        const resolvedRoom = parseResolvedRoom(data as unknown);

        if (!resolvedRoom) {
          setRoom(undefined);
          setError(createInvalidTokenError());
          return;
        }

        if (trackedInviteOpenedRoomId.current !== resolvedRoom.roomId) {
          trackedInviteOpenedRoomId.current = resolvedRoom.roomId;
          trackAnalyticsEvent({
            name: 'invite_opened',
            properties: {
              budgetTier: resolvedRoom.budgetTier,
              categoryCount: resolvedRoom.categoryPreferences.length,
              decisionMode: resolvedRoom.decisionMode,
              participantCount: resolvedRoom.participantCount,
              resultStatus: resolvedRoom.status,
            },
            roomId: resolvedRoom.roomId,
          });
        }

        setRoom(resolvedRoom);
        setError(resolvedRoom.blockedReason && !resolvedRoom.canJoin ? createBlockedError(resolvedRoom.blockedReason) : undefined);
      } catch (resolveFailure) {
        if (isMounted) {
          setRoom(undefined);
          setError(createErrorFromMessage(resolveFailure instanceof Error ? resolveFailure.message : 'Network error.', 'resolve_invite'));
        }
      } finally {
        if (isMounted) {
          setIsResolving(false);
        }
      }
    }

    resolveRoom();

    return () => {
      isMounted = false;
    };
  }, [isAuthLoading, retryCount, session, token]);

  async function handleJoinRoom() {
    if (!room || !token) {
      return;
    }

    if (!room.canJoin) {
      setError(room.blockedReason ? createBlockedError(room.blockedReason) : createErrorFromMessage('closed'));
      return;
    }

    if (room.alreadyJoined) {
      router.replace(`/room/${room.roomId}/vote`);
      return;
    }

    const trimmedDisplayName = displayName.trim();

    if (!trimmedDisplayName) {
      setValidationMessage('Enter a display name before joining.');
      return;
    }

    setError(undefined);
    setIsJoining(true);
    setValidationMessage(undefined);

    try {
      await ensureAuthenticatedSession(trimmedDisplayName);

      const { data, error: joinError } = await supabase.rpc('join_room_by_token', {
        p_display_name: trimmedDisplayName,
        p_invite_token: token,
      });

      if (joinError) {
        throw new Error(joinError.message);
      }

      const joinedRoom = parseJoinRoom(data as unknown);

      trackAnalyticsEvent({
        name: 'participant_joined',
        participantId: joinedRoom.participant_id,
        properties: {
          budgetTier: room.budgetTier,
          categoryCount: room.categoryPreferences.length,
          decisionMode: room.decisionMode,
          participantCount: room.participantCount + 1,
          resultStatus: room.status,
        },
        roomId: joinedRoom.room_id,
      });

      router.replace(`/room/${joinedRoom.room_id}/vote`);
    } catch (joinFailure) {
      setError(createErrorFromMessage(joinFailure instanceof Error ? joinFailure.message : 'Network error.', 'join_room'));
    } finally {
      setIsJoining(false);
    }
  }

  function handleRetry() {
    setRetryCount((currentCount) => currentCount + 1);
  }

  if ((isAuthLoading || isResolving) && !room) {
    return (
      <Screen centered>
        <LoadingState message="Opening invite..." />
      </Screen>
    );
  }

  if (error && !room) {
    return (
      <Screen centered>
        <ErrorState
          message={error.message}
          onRetry={error.retryable ? handleRetry : undefined}
          retryLabel="Retry"
          title={error.title}
        />
      </Screen>
    );
  }

  if (!room) {
    return (
      <Screen centered>
        <ErrorState message="This invite could not be loaded." onRetry={handleRetry} retryLabel="Retry" title="Invite unavailable" />
      </Screen>
    );
  }

  return (
    <Screen contentContainerStyle={styles.screen} padded={false} scroll>
      <View style={styles.header}>
        <Text variant="title">Join Plan</Text>
        <Text color="textSecondary">Confirm the room details, then join the vote.</Text>
      </View>

      <Card style={styles.roomCard} variant="warm">
        <View style={styles.roomHeader}>
          <View style={styles.roomTitleGroup}>
            <Text variant="subtitle">{room.title}</Text>
            <Text color="textSecondary">Hosted by {room.hostDisplayName}</Text>
          </View>
          <Chip title={getStatusLabel(room)} tone={getStatusTone(room)} />
        </View>
        <Text color="textSecondary">{getStatusDescription(room)}</Text>
        <Text color="textSecondary" variant="caption">
          {formatParticipantLabel(room)}
        </Text>
      </Card>

      <Card style={styles.summaryCard}>
        <Text variant="subtitle">Plan Summary</Text>
        <View style={styles.chipGrid}>
          <Chip title={toLabel(room.budgetTier)} tone="yellow" />
          <Chip title={toLabel(room.energyLevel)} tone="green" />
          <Chip title={toLabel(room.locationMode)} tone="blue" />
          <Chip title={toLabel(room.weatherMode)} tone="lavender" />
          <Chip title={toLabel(room.decisionMode)} tone="orange" />
        </View>
        <View style={styles.summaryRows}>
          <Text color="textSecondary">Categories: {room.categoryPreferences.map(toLabel).join(', ') || 'Flexible'}</Text>
          <Text color="textSecondary">Time window: {formatTimeWindow(room)}</Text>
          <Text color="textSecondary">Planning effort: {toLabel(room.planningEffort)}</Text>
        </View>
      </Card>

      <Card style={styles.joinCard}>
        <View style={styles.field}>
          <Text variant="label">Display name</Text>
          <TextInput
            accessibilityLabel="Display name"
            editable={room.canJoin && !room.alreadyJoined && !isJoining}
            onChangeText={(value) => {
              setDisplayName(value);
              setValidationMessage(undefined);
            }}
            placeholder="Your name"
            placeholderTextColor={theme.colors.sidewalkGray}
            style={styles.input}
            value={displayName}
          />
        </View>

        {validationMessage ? (
          <Text color="nopeCoral" variant="caption">
            {validationMessage}
          </Text>
        ) : null}

        {error ? (
          <View accessibilityRole="alert" style={styles.messageBox}>
            <Text color="nopeCoral" variant="caption">
              {error.message}
            </Text>
            {error.retryable ? (
              <Button
                disabled={isJoining}
                loading={isJoining}
                onPress={room.canJoin ? handleJoinRoom : handleRetry}
                title={room.canJoin ? 'Retry join' : 'Retry'}
                variant="outline"
              />
            ) : null}
          </View>
        ) : null}

        <Button
          disabled={!room.canJoin}
          fullWidth
          loading={isJoining}
          onPress={handleJoinRoom}
          size="lg"
          title={room.alreadyJoined ? 'Continue to voting' : 'Join room'}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  field: {
    gap: theme.spacing.sm,
  },
  header: {
    gap: theme.spacing.sm,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    color: theme.colors.textPrimary,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  joinCard: {
    gap: theme.spacing.md,
  },
  messageBox: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.nopeCoral,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    padding: theme.spacing.md,
  },
  roomCard: {
    gap: theme.spacing.md,
  },
  roomHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  roomTitleGroup: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  screen: {
    gap: theme.spacing.xl,
    padding: theme.spacing.xl,
  },
  summaryCard: {
    gap: theme.spacing.md,
  },
  summaryRows: {
    gap: theme.spacing.xs,
  },
});
