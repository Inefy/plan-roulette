// src/app/room/[roomId]/index.tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { Avatar, Button, Card, Chip, EmptyState, ErrorState, ProgressBar, Screen, SkeletonBlock, SkeletonText, Text } from '../../../components';
import { theme } from '../../../constants/theme';
import { useAuth } from '../../../features/auth/AuthProvider';
import { trackAnalyticsEvent } from '../../../lib/analytics';
import { buildInviteLink, buildInviteShareMessage } from '../../../lib/linkBuilder';
import { rememberRecentRoom } from '../../../lib/recentRooms';
import { getFriendlyRemoteError } from '../../../lib/remoteErrors';
import { finalizeRoomResult, RoomFinalizationError } from '../../../lib/roomFinalizer';
import { supabase } from '../../../lib/supabase';
import type { BudgetTier, DecisionMode, ParticipantRole, PlanCategory, RoomStatus } from '../../../types/domain';

type RoomRouteParams = {
  roomId?: string | string[];
};

type RoomRow = {
  budget_tier: BudgetTier;
  category_preferences: PlanCategory[];
  decision_mode: DecisionMode;
  id: string;
  itinerary_id: string | null;
  invite_token: string;
  status: RoomStatus;
  title: string;
  updated_at: string;
};

type ParticipantRow = {
  avatar_url: string | null;
  display_name: string;
  id: string;
  is_ready: boolean;
  joined_at: string;
  role: ParticipantRole;
  user_id: string | null;
};

type LobbyData = {
  currentParticipant?: ParticipantRow;
  optionCount: number;
  participants: ParticipantRow[];
  room: RoomRow;
};

type LobbyError = {
  message: string;
  retryable: boolean;
  title: string;
};

function getParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function toLabel(value: string) {
  return value
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isVotingClosed(status: RoomStatus) {
  return !['draft', 'inviting', 'voting'].includes(status);
}

function getStatusTone(status: RoomStatus) {
  if (status === 'voting') {
    return 'green';
  }

  if (status === 'inviting' || status === 'draft') {
    return 'blue';
  }

  if (status === 'cancelled' || status === 'expired') {
    return 'red';
  }

  return 'orange';
}

function getStatusDescription(status: RoomStatus) {
  if (status === 'inviting') {
    return 'Invite people and start voting when the group is ready.';
  }

  if (status === 'voting') {
    return 'Voting is open. Participants can start or resume their ballots.';
  }

  if (status === 'deciding') {
    return 'Voting is closed and the result is being calculated.';
  }

  if (status === 'decided' || status === 'itinerary_ready' || status === 'completed') {
    return 'Voting is closed. The group can review the result.';
  }

  return 'This room is not accepting votes.';
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();
}

function getAvatarTone(index: number) {
  const tones = ['orange', 'blue', 'green', 'lavender', 'yellow', 'red'] as const;

  return tones[index % tones.length];
}

function createLobbyError(message: string): LobbyError {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('jwt') || normalizedMessage.includes('auth') || normalizedMessage.includes('permission')) {
    return {
      message: 'Join this room with the invite link before opening the lobby.',
      retryable: false,
      title: 'Room access needed',
    };
  }

  if (normalizedMessage.includes('0 rows') || normalizedMessage.includes('not found')) {
    return {
      message: 'This room was not found or your session cannot access it.',
      retryable: false,
      title: 'Room not found',
    };
  }

  const friendlyError = getFriendlyRemoteError(message, 'room_fetch', {
    message: message || 'Check your connection and try again.',
    retryable: true,
    title: 'Unable to load room',
  });

  if (friendlyError.isOffline) {
    return {
      message: friendlyError.message,
      retryable: friendlyError.retryable,
      title: friendlyError.title,
    };
  }

  return {
    message: message || 'Check your connection and try again.',
    retryable: true,
    title: 'Unable to load room',
  };
}

function LobbySkeleton() {
  return (
    <Screen contentContainerStyle={styles.screen} padded={false} scroll>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <SkeletonBlock height={30} width="62%" />
          <SkeletonBlock height={16} width="42%" />
        </View>
        <SkeletonBlock height={48} radius="pill" width={88} />
      </View>

      <Card style={styles.statusCard} variant="warm">
        <View style={styles.statusHeader}>
          <SkeletonBlock height={24} width="44%" />
          <SkeletonBlock height={28} radius="pill" width={96} />
        </View>
        <SkeletonText lines={2} widths={['88%', '56%']} />
        <SkeletonBlock height={10} radius="pill" />
        <View style={styles.statGrid}>
          <SkeletonBlock height={86} style={styles.skeletonStat} width={0} />
          <SkeletonBlock height={86} style={styles.skeletonStat} width={0} />
        </View>
      </Card>

      <Card style={styles.participantCard}>
        <View style={styles.sectionHeader}>
          <SkeletonBlock height={24} width="38%" />
          <SkeletonBlock height={28} radius="pill" width={96} />
        </View>
        {[0, 1, 2].map((item) => (
          <View key={item} style={styles.participantRow}>
            <SkeletonBlock height={40} radius="pill" width={40} />
            <View style={styles.participantText}>
              <SkeletonBlock height={16} width="54%" />
              <SkeletonBlock height={12} width="32%" />
            </View>
            <SkeletonBlock height={28} radius="pill" width={72} />
          </View>
        ))}
      </Card>
    </Screen>
  );
}

export default function RoomRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<RoomRouteParams>();
  const roomId = useMemo(() => getParamValue(params.roomId)?.trim(), [params.roomId]);
  const { isLoading: isAuthLoading, session } = useAuth();
  const userId = session?.user.id;
  const queuedRefreshRef = useRef(false);
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refreshInFlightRef = useRef(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>();
  const [inviteAction, setInviteAction] = useState<'copy' | 'share' | undefined>();
  const [isClosingVoting, setIsClosingVoting] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lobbyData, setLobbyData] = useState<LobbyData | undefined>();
  const [lobbyError, setLobbyError] = useState<LobbyError | undefined>();

  const refreshLobby = useCallback(
    async (isBackgroundRefresh = false) => {
      if (!roomId || !userId) {
        setLobbyError({
          message: roomId ? 'Join this room before opening the lobby.' : 'The room link is missing a room id.',
          retryable: false,
          title: roomId ? 'Room access needed' : 'Room unavailable',
        });
        setIsInitialLoading(false);
        return;
      }

      if (refreshInFlightRef.current) {
        queuedRefreshRef.current = true;
        return;
      }

      refreshInFlightRef.current = true;
      let nextIsBackgroundRefresh = isBackgroundRefresh;

      try {
        do {
          queuedRefreshRef.current = false;

          if (nextIsBackgroundRefresh) {
            setIsRefreshing(true);
          } else {
            setIsInitialLoading(true);
          }

          try {
            const [
              { data: roomData, error: roomError },
              { data: participantData, error: participantError },
              { count: optionCount, error: optionError },
            ] = await Promise.all([
              supabase
                .from('plan_rooms')
                .select('id, title, status, invite_token, itinerary_id, updated_at, budget_tier, category_preferences, decision_mode')
                .eq('id', roomId)
                .single(),
              supabase
                .from('plan_participants')
                .select('id, user_id, display_name, avatar_url, role, is_ready, joined_at')
                .eq('room_id', roomId)
                .order('joined_at', { ascending: true }),
              supabase
                .from('plan_options')
                .select('id', { count: 'exact', head: true })
                .eq('room_id', roomId)
                .eq('is_active', true),
            ]);

            if (roomError) {
              throw new Error(roomError.message);
            }

            if (participantError) {
              throw new Error(participantError.message);
            }

            if (optionError) {
              throw new Error(optionError.message);
            }

            const room = roomData as unknown as RoomRow;
            const participants = (participantData ?? []) as ParticipantRow[];
            const currentParticipant = participants.find((participant) => participant.user_id === userId);

            setLobbyData({
              currentParticipant,
              optionCount: optionCount ?? 0,
              participants,
              room,
            });
            void rememberRecentRoom({
              id: room.id,
              itineraryId: room.itinerary_id,
              status: room.status,
              title: room.title,
              updatedAt: room.updated_at,
            });
            setLobbyError(undefined);
          } catch (error) {
            setLobbyError(createLobbyError(error instanceof Error ? error.message : 'Network error.'));
          } finally {
            setIsInitialLoading(false);
            setIsRefreshing(false);
          }

          nextIsBackgroundRefresh = true;
        } while (queuedRefreshRef.current);
      } finally {
        refreshInFlightRef.current = false;
      }
    },
    [roomId, userId],
  );

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    refreshLobby();
  }, [isAuthLoading, refreshLobby]);

  useEffect(() => {
    if (!userId || !roomId) {
      return undefined;
    }

    function scheduleRefresh() {
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current);
      }

      refreshDebounceRef.current = setTimeout(() => {
        refreshDebounceRef.current = undefined;
        void refreshLobby(true);
      }, 250);
    }

    const channel = supabase
      .channel(`room-lobby:${roomId}`)
      .on('postgres_changes', { event: '*', filter: `id=eq.${roomId}`, schema: 'public', table: 'plan_rooms' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', filter: `room_id=eq.${roomId}`, schema: 'public', table: 'plan_participants' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', filter: `room_id=eq.${roomId}`, schema: 'public', table: 'plan_options' }, scheduleRefresh)
      .subscribe();

    const intervalId = setInterval(() => {
      refreshLobby(true);
    }, 60000);

    return () => {
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current);
        refreshDebounceRef.current = undefined;
      }

      clearInterval(intervalId);
      void supabase.removeChannel(channel);
    };
  }, [refreshLobby, roomId, userId]);

  async function handleShareInvite() {
    if (!lobbyData) {
      return;
    }

    setInviteAction('share');
    setFeedbackMessage(undefined);

    try {
      const inviteLink = buildInviteLink(lobbyData.room.invite_token);
      const result = await Share.share({
        message: buildInviteShareMessage(inviteLink),
      });

      if (result.action === Share.dismissedAction) {
        setFeedbackMessage('Share canceled.');
        return;
      }

      setFeedbackMessage('Invite ready to send.');
      trackAnalyticsEvent({
        name: 'invite_shared',
        participantId: lobbyData.currentParticipant?.id,
        properties: {
          budgetTier: lobbyData.room.budget_tier,
          categoryCount: lobbyData.room.category_preferences.length,
          decisionMode: lobbyData.room.decision_mode,
          method: 'native_share',
          optionCount: lobbyData.optionCount,
          participantCount: lobbyData.participants.length,
        },
        roomId: lobbyData.room.id,
      });
    } catch (error) {
      const friendlyError = getFriendlyRemoteError(error, 'share_link', {
        message: 'Sharing is unavailable right now. The invite link is still available to copy.',
        retryable: false,
        title: 'Sharing unavailable',
      });

      setFeedbackMessage(friendlyError.message);
    } finally {
      setInviteAction(undefined);
    }
  }

  async function handleCopyInvite() {
    if (!lobbyData) {
      return;
    }

    setInviteAction('copy');
    setFeedbackMessage(undefined);

    try {
      const inviteLink = buildInviteLink(lobbyData.room.invite_token);

      await Clipboard.setStringAsync(inviteLink);
      setFeedbackMessage('Invite link copied.');
      trackAnalyticsEvent({
        name: 'invite_shared',
        participantId: lobbyData.currentParticipant?.id,
        properties: {
          budgetTier: lobbyData.room.budget_tier,
          categoryCount: lobbyData.room.category_preferences.length,
          decisionMode: lobbyData.room.decision_mode,
          method: 'copy_link',
          optionCount: lobbyData.optionCount,
          participantCount: lobbyData.participants.length,
        },
        roomId: lobbyData.room.id,
      });
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : 'Unable to copy this invite link.');
    } finally {
      setInviteAction(undefined);
    }
  }

  async function handleCloseVoting() {
    if (!roomId) {
      return;
    }

    setFeedbackMessage(undefined);
    setIsClosingVoting(true);

    try {
      const result = await finalizeRoomResult(roomId);
      setFeedbackMessage(result.outcome === 'winner_selected' ? 'Winner picked.' : result.reason);
      if (lobbyData) {
        trackAnalyticsEvent({
          name: 'voting_closed',
          participantId: lobbyData.currentParticipant?.id,
          properties: {
            budgetTier: lobbyData.room.budget_tier,
            categoryCount: lobbyData.room.category_preferences.length,
            decisionMode: lobbyData.room.decision_mode,
            optionCount: lobbyData.optionCount,
            participantCount,
            resultStatus: result.outcome,
          },
          roomId,
        });
      }
      router.push(`/room/${roomId}/result`);
    } catch (error) {
      if (error instanceof RoomFinalizationError && error.kind === 'network') {
        const friendlyError = getFriendlyRemoteError(error, 'close_voting', {
          message: 'Unable to close voting. Check your connection and try again.',
          retryable: true,
          title: 'Unable to close voting',
        });

        setFeedbackMessage(friendlyError.message);
      } else if (error instanceof RoomFinalizationError) {
        setFeedbackMessage(error.message);
      } else {
        const friendlyError = getFriendlyRemoteError(error, 'close_voting', {
          message: 'Unable to close voting. Check your connection and try again.',
          retryable: true,
          title: 'Unable to close voting',
        });

        setFeedbackMessage(friendlyError.message);
      }
    } finally {
      setIsClosingVoting(false);
    }
  }

  if (isAuthLoading || isInitialLoading) {
    return <LobbySkeleton />;
  }

  if (lobbyError && !lobbyData) {
    return (
      <Screen centered>
        <ErrorState
          message={lobbyError.message}
          onRetry={lobbyError.retryable ? () => refreshLobby() : undefined}
          retryLabel="Retry"
          title={lobbyError.title}
        />
      </Screen>
    );
  }

  if (!lobbyData) {
    return (
      <Screen centered>
        <EmptyState
          action={<Button onPress={() => refreshLobby()} title="Retry" variant="outline" />}
          message="The lobby has no room data yet."
          title="Room unavailable"
        />
      </Screen>
    );
  }

  const { currentParticipant, optionCount, participants, room } = lobbyData;
  const isHost = currentParticipant?.role === 'host';
  const closed = isVotingClosed(room.status);
  const completedVotes = participants.filter((participant) => participant.is_ready).length;
  const participantCount = participants.length;

  return (
    <Screen contentContainerStyle={styles.screen} padded={false} scroll>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text variant="title">{room.title}</Text>
          <Text color="textSecondary">{currentParticipant ? `You are ${toLabel(currentParticipant.role)}` : 'Participant access needed'}</Text>
        </View>
        <Button loading={inviteAction === 'share'} onPress={handleShareInvite} title="Invite" variant="secondary" />
      </View>

      <Card style={styles.statusCard} variant="warm">
        <View style={styles.statusHeader}>
          <Text variant="subtitle">Lobby Status</Text>
          <Chip title={toLabel(room.status)} tone={getStatusTone(room.status)} />
        </View>
        <Text color="textSecondary">{getStatusDescription(room.status)}</Text>
        <ProgressBar
          accessibilityLabel="Vote completion"
          color={completedVotes === participantCount && participantCount > 0 ? 'goGreen' : 'poolBlue'}
          max={Math.max(participantCount, 1)}
          value={completedVotes}
        />
        <View style={styles.statGrid}>
          <View style={styles.statItem}>
            <Text variant="subtitle">{completedVotes}/{participantCount}</Text>
            <Text color="textSecondary" variant="caption">
              votes complete
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text variant="subtitle">{optionCount}</Text>
            <Text color="textSecondary" variant="caption">
              options
            </Text>
          </View>
        </View>
        {isRefreshing ? (
          <Text color="textSecondary" variant="caption">
            Refreshing lobby...
          </Text>
        ) : null}
      </Card>

      <Card style={styles.participantCard}>
        <View style={styles.sectionHeader}>
          <Text variant="subtitle">Participants</Text>
          <Chip title={`${participantCount} joined`} tone="blue" />
        </View>
        {participants.length === 0 ? (
          <EmptyState message="Invite friends to fill the lobby." title="No participants yet" />
        ) : (
          <View style={styles.participantList}>
            {participants.map((participant, index) => (
              <View key={participant.id} style={styles.participantRow}>
                <Avatar
                  initials={getInitials(participant.display_name)}
                  name={participant.display_name}
                  size="sm"
                  tone={getAvatarTone(index)}
                />
                <View style={styles.participantText}>
                  <Text variant="bodyStrong">{participant.display_name}</Text>
                  <Text color="textSecondary" variant="caption">
                    {toLabel(participant.role)}
                  </Text>
                </View>
                <Chip
                  selected={participant.is_ready}
                  title={participant.is_ready ? 'Done' : 'Voting'}
                  tone={participant.is_ready ? 'green' : 'neutral'}
                />
              </View>
            ))}
          </View>
        )}
      </Card>

      {feedbackMessage || lobbyError ? (
        <View accessibilityLiveRegion="polite" style={styles.feedbackBox}>
          <Text color={lobbyError ? 'nopeCoral' : 'textSecondary'} variant="caption">
            {lobbyError?.message ?? feedbackMessage}
          </Text>
          {lobbyError?.retryable ? <Button onPress={() => refreshLobby()} title="Retry refresh" variant="outline" /> : null}
        </View>
      ) : null}

      {isHost ? (
        <Card style={styles.controlsCard} variant="warm">
          <Text variant="subtitle">Host Controls</Text>
          <View style={styles.controlButtons}>
            <Button fullWidth onPress={handleShareInvite} title="Invite more" variant="secondary" />
            <Button
              disabled={closed}
              fullWidth
              loading={isClosingVoting}
              onPress={handleCloseVoting}
              title="Close Voting / Pick Winner"
              variant="danger"
            />
          </View>
        </Card>
      ) : null}

      <Card style={styles.controlsCard}>
        <Text variant="subtitle">Participant Controls</Text>
        <View style={styles.controlButtons}>
          {!closed ? (
            <Button
              disabled={!currentParticipant}
              fullWidth
              onPress={() => router.push(`/room/${room.id}/vote`)}
              size="lg"
              title={currentParticipant?.is_ready ? 'Resume voting' : 'Start voting'}
            />
          ) : (
            <Button fullWidth onPress={() => router.push(`/room/${room.id}/result`)} size="lg" title="View result" />
          )}
          <Button fullWidth onPress={() => refreshLobby()} title="Refresh lobby" variant="outline" />
          <Button fullWidth loading={inviteAction === 'copy'} onPress={handleCopyInvite} title="Copy invite link" variant="outline" />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  controlButtons: {
    gap: theme.spacing.md,
  },
  controlsCard: {
    gap: theme.spacing.md,
  },
  feedbackBox: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    padding: theme.spacing.md,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  participantCard: {
    gap: theme.spacing.md,
  },
  participantList: {
    gap: theme.spacing.md,
  },
  participantRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    minHeight: 56,
  },
  participantText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  screen: {
    gap: theme.spacing.xl,
    padding: theme.spacing.xl,
  },
  sectionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  skeletonStat: {
    flexGrow: 1,
    minWidth: 128,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  statItem: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    flexGrow: 1,
    gap: theme.spacing.xs,
    minWidth: 128,
    padding: theme.spacing.md,
  },
  statusCard: {
    gap: theme.spacing.md,
  },
  statusHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  titleGroup: {
    flex: 1,
    gap: theme.spacing.xs,
  },
});
