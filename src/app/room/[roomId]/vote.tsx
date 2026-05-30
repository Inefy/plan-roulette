// src/app/room/[roomId]/vote.tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Chip, EmptyState, ErrorState, LoadingState, ProgressBar, Screen, SkeletonBlock, SkeletonText, Text } from '../../../components';
import { theme } from '../../../constants/theme';
import { useAuth } from '../../../features/auth/AuthProvider';
import { GuestUpgradePrompt } from '../../../features/auth/GuestUpgradePrompt';
import { PlanOptionCard } from '../../../features/plan/components';
import { trackAnalyticsEvent } from '../../../lib/analytics';
import { getFriendlyRemoteError } from '../../../lib/remoteErrors';
import { supabase } from '../../../lib/supabase';
import type { BudgetTier, DecisionMode, EnergyLevel, LocationMode, ParticipantRole, PlanCategory, RoomStatus, VoteValue } from '../../../types/domain';
import { toDisplayLabel } from '../../../utils/displayLabels';

type RoomVoteRouteParams = {
  roomId?: string | string[];
};

type RoomRow = {
  budget_tier: BudgetTier;
  category_preferences: PlanCategory[];
  decision_mode: DecisionMode;
  id: string;
  status: RoomStatus;
  title: string;
};

type ParticipantRow = {
  display_name: string;
  id: string;
  is_ready: boolean;
  role: ParticipantRole;
  user_id: string | null;
};

type OptionRow = {
  budget_tier: BudgetTier;
  category: PlanCategory;
  created_at: string;
  description: string | null;
  energy_level: EnergyLevel;
  id: string;
  location_mode: LocationMode;
  max_duration_minutes: number | null;
  min_duration_minutes: number | null;
  title: string;
};

type VoteRow = {
  created_at: string;
  id: string;
  option_id: string;
  participant_id: string;
  updated_at: string;
  value: VoteValue;
};

type FailedVote = {
  optionId: string;
  value: VoteValue;
};

type VoteScreenData = {
  currentParticipant: ParticipantRow;
  options: OptionRow[];
  room: RoomRow;
  votesByOptionId: Record<string, VoteRow>;
};

type VoteScreenError = {
  message: string;
  retryable: boolean;
  title: string;
};

const voteLabels: Record<VoteValue, string> = {
  maybe: 'Maybe',
  no: 'No',
  skip: 'Skip',
  yes: 'Yes',
};

function getParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function toLabel(value: string) {
  return toDisplayLabel(value);
}

function isVotingClosed(status: RoomStatus) {
  return !['inviting', 'voting'].includes(status);
}

function createVoteError(message: string): VoteScreenError {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('permission') || normalizedMessage.includes('auth') || normalizedMessage.includes('participant')) {
    return {
      message: 'Join this room before voting.',
      retryable: false,
      title: 'Voting access needed',
    };
  }

  if (normalizedMessage.includes('closed') || normalizedMessage.includes('cancelled') || normalizedMessage.includes('expired')) {
    return {
      message: 'Voting is closed for this room.',
      retryable: false,
      title: 'Voting closed',
    };
  }

  const friendlyError = getFriendlyRemoteError(message, 'room_fetch', {
    message: message || 'Check your connection and try again.',
    retryable: true,
    title: 'Unable to load voting',
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
    title: 'Unable to load voting',
  };
}

function buildVotesByOptionId(votes: readonly VoteRow[]) {
  return votes.reduce<Record<string, VoteRow>>((accumulator, vote) => {
    accumulator[vote.option_id] = vote;
    return accumulator;
  }, {});
}

function getAnsweredCount(options: readonly OptionRow[], votesByOptionId: Record<string, VoteRow>) {
  return options.filter((option) => Boolean(votesByOptionId[option.id])).length;
}

function getFirstUnvotedIndex(options: readonly OptionRow[], votesByOptionId: Record<string, VoteRow>) {
  return options.findIndex((option) => !votesByOptionId[option.id]);
}

function getNextIndex(options: readonly OptionRow[], votesByOptionId: Record<string, VoteRow>, currentIndex: number) {
  const afterCurrentIndex = options.findIndex((option, index) => index > currentIndex && !votesByOptionId[option.id]);

  if (afterCurrentIndex !== -1) {
    return afterCurrentIndex;
  }

  const firstUnvotedIndex = getFirstUnvotedIndex(options, votesByOptionId);

  return firstUnvotedIndex === -1 ? currentIndex : firstUnvotedIndex;
}

function formatOptionMeta(option: OptionRow) {
  const duration =
    option.min_duration_minutes && option.max_duration_minutes
      ? `${option.min_duration_minutes}-${option.max_duration_minutes} min`
      : 'Flexible time';

  return [duration, toLabel(option.budget_tier), toLabel(option.energy_level), toLabel(option.location_mode)].join(' | ');
}

function createOptimisticVote(optionId: string, participantId: string, roomId: string, value: VoteValue): VoteRow {
  const timestamp = new Date().toISOString();

  return {
    created_at: timestamp,
    id: `optimistic-${optionId}`,
    option_id: optionId,
    participant_id: participantId,
    updated_at: timestamp,
    value,
  };
}

function replaceVote(votesByOptionId: Record<string, VoteRow>, vote: VoteRow) {
  return {
    ...votesByOptionId,
    [vote.option_id]: vote,
  };
}

function VotingSkeleton() {
  return (
    <Screen contentContainerStyle={styles.screen} padded={false} scroll>
      <View style={styles.header}>
        <SkeletonBlock height={30} width="64%" />
        <SkeletonBlock height={16} width="46%" />
      </View>

      <Card style={styles.progressCard} variant="warm">
        <View style={styles.progressHeader}>
          <SkeletonBlock height={24} width="36%" />
          <SkeletonBlock height={28} radius="pill" width={64} />
        </View>
        <SkeletonBlock height={10} radius="pill" />
        <SkeletonBlock height={14} width="48%" />
      </Card>

      <Card style={styles.skeletonOptionCard}>
        <SkeletonBlock height={28} radius="pill" width={104} />
        <SkeletonBlock height={26} width="72%" />
        <SkeletonText lines={3} widths={['96%', '86%', '54%']} />
        <SkeletonBlock height={16} width="52%" />
      </Card>

      <View style={styles.voteActions}>
        <View style={styles.voteRow}>
          <SkeletonBlock height={56} radius="pill" style={styles.voteButton} width={0} />
          <SkeletonBlock height={56} radius="pill" style={styles.voteButton} width={0} />
          <SkeletonBlock height={56} radius="pill" style={styles.voteButton} width={0} />
        </View>
        <SkeletonBlock height={48} radius="pill" />
      </View>
    </Screen>
  );
}

export default function RoomVoteRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<RoomVoteRouteParams>();
  const roomId = useMemo(() => getParamValue(params.roomId)?.trim(), [params.roomId]);
  const { isLoading: isAuthLoading, session } = useAuth();
  const userId = session?.user.id;
  const queuedRefreshRef = useRef(false);
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refreshInFlightRef = useRef(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [failedVote, setFailedVote] = useState<FailedVote | undefined>();
  const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>();
  const [history, setHistory] = useState<number[]>([]);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingVote, setIsSavingVote] = useState(false);
  const [screenData, setScreenData] = useState<VoteScreenData | undefined>();
  const [screenError, setScreenError] = useState<VoteScreenError | undefined>();

  const refreshVoting = useCallback(
    async (isBackgroundRefresh = false) => {
      if (!roomId || !userId) {
        setScreenError({
          message: roomId ? 'Join this room before voting.' : 'The room link is missing a room id.',
          retryable: false,
          title: roomId ? 'Voting access needed' : 'Room unavailable',
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
              { data: optionsData, error: optionsError },
            ] = await Promise.all([
              supabase
                .from('plan_rooms')
                .select('id, title, status, budget_tier, category_preferences, decision_mode')
                .eq('id', roomId)
                .single(),
              supabase
                .from('plan_participants')
                .select('id, user_id, display_name, role, is_ready')
                .eq('room_id', roomId)
                .eq('user_id', userId)
                .single(),
              supabase
                .from('plan_options')
                .select('id, title, description, category, budget_tier, energy_level, location_mode, min_duration_minutes, max_duration_minutes, created_at')
                .eq('room_id', roomId)
                .eq('is_active', true)
                .order('created_at', { ascending: true }),
            ]);

            if (roomError) {
              throw new Error(roomError.message);
            }

            if (participantError) {
              throw new Error(participantError.message);
            }

            if (optionsError) {
              throw new Error(optionsError.message);
            }

            const { data: votesData, error: votesError } = await supabase
              .from('plan_votes')
              .select('id, room_id, option_id, participant_id, value, created_at, updated_at')
              .eq('room_id', roomId)
              .eq('participant_id', participantData.id);

            if (votesError) {
              throw new Error(votesError.message);
            }

            const options = (optionsData ?? []) as OptionRow[];
            const votesByOptionId = buildVotesByOptionId((votesData ?? []) as VoteRow[]);
            const firstUnvotedIndex = getFirstUnvotedIndex(options, votesByOptionId);

            setScreenData({
              currentParticipant: participantData as ParticipantRow,
              options,
              room: roomData as RoomRow,
              votesByOptionId,
            });
            setCurrentIndex((activeIndex) => {
              if (options.length === 0) {
                return 0;
              }

              if (firstUnvotedIndex === -1) {
                return Math.min(activeIndex, options.length - 1);
              }

              const activeOption = options[activeIndex];

              if (activeOption && !votesByOptionId[activeOption.id]) {
                return activeIndex;
              }

              return firstUnvotedIndex;
            });
            setFailedVote(undefined);
            setScreenError(undefined);
          } catch (error) {
            setScreenError(createVoteError(error instanceof Error ? error.message : 'Network error.'));
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

  const markComplete = useCallback(
    async (votesByOptionId: Record<string, VoteRow>, options: readonly OptionRow[], analyticsContext?: { participantId: string; room: RoomRow }) => {
      if (!roomId || options.length === 0 || getAnsweredCount(options, votesByOptionId) < options.length) {
        return;
      }

      setIsCompleting(true);
      setFeedbackMessage(undefined);

      try {
        const { data, error } = await supabase.rpc('mark_vote_complete', {
          p_room_id: roomId,
        });

        if (error) {
          throw new Error(error.message);
        }

        setScreenData((currentData) =>
          currentData
            ? {
                ...currentData,
                currentParticipant: {
                  ...currentData.currentParticipant,
                  is_ready: (data as Partial<ParticipantRow> | null)?.is_ready ?? true,
                },
              }
            : currentData,
        );
        setFeedbackMessage('Voting complete.');
        if (analyticsContext) {
          trackAnalyticsEvent({
            name: 'vote_completed',
            participantId: analyticsContext.participantId,
            properties: {
              budgetTier: analyticsContext.room.budget_tier,
              categoryCount: analyticsContext.room.category_preferences.length,
              decisionMode: analyticsContext.room.decision_mode,
              optionCount: options.length,
            },
            roomId,
          });
        }
      } catch (error) {
        setScreenError({
          message: getFriendlyRemoteError(error, 'vote_save', {
            message: 'Unable to mark voting complete. Check your connection and try again.',
            retryable: true,
            title: 'Finish voting failed',
          }).message,
          retryable: true,
          title: 'Finish voting failed',
        });
      } finally {
        setIsCompleting(false);
      }
    },
    [roomId],
  );

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    refreshVoting();
  }, [isAuthLoading, refreshVoting]);

  useEffect(() => {
    if (!roomId || !userId) {
      return undefined;
    }

    function scheduleRefresh() {
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current);
      }

      refreshDebounceRef.current = setTimeout(() => {
        refreshDebounceRef.current = undefined;
        void refreshVoting(true);
      }, 250);
    }

    const channel = supabase
      .channel(`room-vote:${roomId}`)
      .on('postgres_changes', { event: '*', filter: `id=eq.${roomId}`, schema: 'public', table: 'plan_rooms' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', filter: `room_id=eq.${roomId}`, schema: 'public', table: 'plan_options' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', filter: `room_id=eq.${roomId}`, schema: 'public', table: 'plan_votes' }, scheduleRefresh)
      .subscribe();

    const intervalId = setInterval(() => {
      refreshVoting(true);
    }, 60000);

    return () => {
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current);
        refreshDebounceRef.current = undefined;
      }

      clearInterval(intervalId);
      void supabase.removeChannel(channel);
    };
  }, [refreshVoting, roomId, userId]);

  async function persistVote(option: OptionRow, value: VoteValue, shouldAdvance: boolean, isRetry = false) {
    if (!roomId || !screenData || isSavingVote || (!isRetry && failedVote)) {
      return;
    }

    const optimisticVote = createOptimisticVote(option.id, screenData.currentParticipant.id, roomId, value);
    const optimisticVotes = replaceVote(screenData.votesByOptionId, optimisticVote);

    setScreenData({
      ...screenData,
      currentParticipant: {
        ...screenData.currentParticipant,
        is_ready: false,
      },
      votesByOptionId: optimisticVotes,
    });
    setFeedbackMessage(undefined);
    setIsSavingVote(true);
    setScreenError(undefined);

    if (shouldAdvance) {
      setHistory((currentHistory) => [...currentHistory, currentIndex]);
      setCurrentIndex(getNextIndex(screenData.options, optimisticVotes, currentIndex));
    }

    try {
      const { data, error } = await supabase.rpc('cast_vote', {
        p_option_id: option.id,
        p_room_id: roomId,
        p_value: value,
      });

      if (error) {
        throw new Error(error.message);
      }

      const savedVote = data as VoteRow;
      const savedVotes = replaceVote(optimisticVotes, savedVote);

      trackAnalyticsEvent({
        name: 'vote_cast',
        optionId: option.id,
        participantId: screenData.currentParticipant.id,
        properties: {
          budgetTier: screenData.room.budget_tier,
          categoryCount: screenData.room.category_preferences.length,
          decisionMode: screenData.room.decision_mode,
          optionCount: screenData.options.length,
        },
        roomId,
      });

      setScreenData((currentData) =>
        currentData
          ? {
              ...currentData,
              votesByOptionId: replaceVote(currentData.votesByOptionId, savedVote),
            }
          : currentData,
      );
      setFailedVote(undefined);

      if (getAnsweredCount(screenData.options, savedVotes) === screenData.options.length) {
        await markComplete(savedVotes, screenData.options, {
          participantId: screenData.currentParticipant.id,
          room: screenData.room,
        });
      }
    } catch (error) {
      const friendlyError = getFriendlyRemoteError(error, 'vote_save', {
        message: 'Unable to save this vote. Check your connection and try again.',
        retryable: true,
        title: 'Vote not saved',
      });

      setFailedVote({
        optionId: option.id,
        value,
      });
      setFeedbackMessage(friendlyError.message);
    } finally {
      setIsSavingVote(false);
    }
  }

  async function handleRetryVote() {
    if (!failedVote || !screenData) {
      return;
    }

    const option = screenData.options.find((candidate) => candidate.id === failedVote.optionId);

    if (!option) {
      setFailedVote(undefined);
      return;
    }

    await persistVote(option, failedVote.value, false, true);
  }

  function handleUndo() {
    if (history.length > 0) {
      const previousIndex = history[history.length - 1];
      setHistory((currentHistory) => currentHistory.slice(0, -1));
      setCurrentIndex(previousIndex);
      setFeedbackMessage('Change your previous vote.');
      return;
    }

    setCurrentIndex((activeIndex) => Math.max(activeIndex - 1, 0));
    setFeedbackMessage('Change your previous vote.');
  }

  if (isAuthLoading || isInitialLoading) {
    return <VotingSkeleton />;
  }

  if (screenError && !screenData) {
    return (
      <Screen centered>
        <ErrorState
          message={screenError.message}
          onRetry={screenError.retryable ? () => refreshVoting() : undefined}
          retryLabel="Retry"
          title={screenError.title}
        />
      </Screen>
    );
  }

  if (!screenData) {
    return (
      <Screen centered>
        <EmptyState
          action={<Button onPress={() => refreshVoting()} title="Retry" variant="outline" />}
          message="The vote deck could not be loaded."
          title="No vote deck"
        />
      </Screen>
    );
  }

  if (isVotingClosed(screenData.room.status)) {
    return (
      <Screen centered>
        <EmptyState
          action={<Button onPress={() => router.replace(`/room/${screenData.room.id}/result`)} title="View result" />}
          message="Voting is closed for this room."
          title="Voting closed"
        />
      </Screen>
    );
  }

  if (screenData.options.length === 0) {
    return (
      <Screen centered>
        <EmptyState
          action={<Button onPress={() => refreshVoting()} title="Refresh" variant="outline" />}
          message="The host has not added options yet."
          title="No options yet"
        />
      </Screen>
    );
  }

  const answeredCount = getAnsweredCount(screenData.options, screenData.votesByOptionId);
  const isComplete = answeredCount === screenData.options.length && !failedVote;
  const activeOption = screenData.options[Math.min(currentIndex, screenData.options.length - 1)];
  const activeVote = screenData.votesByOptionId[activeOption.id];
  const hasNewOptionsAfterCompletion = screenData.currentParticipant.is_ready && answeredCount < screenData.options.length;

  if (isComplete) {
    return (
      <Screen contentContainerStyle={styles.screen} padded={false} scroll>
        <View style={styles.header}>
          <Text variant="title">{screenData.room.title}</Text>
          <Text color="textSecondary">Your ballot covers every current option.</Text>
        </View>

        <Card style={styles.progressCard} variant="warm">
          <Text variant="subtitle">Voting Complete</Text>
          <ProgressBar accessibilityLabel="Voting progress" color="goGreen" max={screenData.options.length} value={answeredCount} />
          <Text color="textSecondary" variant="caption">
            {answeredCount}/{screenData.options.length} options voted
          </Text>
          {isCompleting ? <LoadingState message="Finishing your ballot..." /> : null}
          {screenError ? (
            <View accessibilityRole="alert" style={styles.messageBox}>
              <Text color="nopeCoral" variant="caption">
                {screenError.message}
              </Text>
              {screenError.retryable ? (
                <Button
                  onPress={() =>
                    markComplete(screenData.votesByOptionId, screenData.options, {
                      participantId: screenData.currentParticipant.id,
                      room: screenData.room,
                    })
                  }
                  title="Retry finish"
                  variant="outline"
                />
              ) : null}
            </View>
          ) : null}
        </Card>

        <GuestUpgradePrompt redirectTo={`/room/${screenData.room.id}/vote`} />

        <View style={styles.actions}>
          <Button fullWidth onPress={() => router.replace(`/room/${screenData.room.id}`)} size="lg" title="Back to lobby" />
          <Button fullWidth onPress={() => refreshVoting()} title="Check for new options" variant="outline" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen contentContainerStyle={styles.screen} padded={false} scroll>
      <View style={styles.header}>
        <Text variant="title">{screenData.room.title}</Text>
        <Text color="textSecondary">Vote one option at a time.</Text>
      </View>

      <Card style={styles.progressCard} variant="warm">
        <View style={styles.progressHeader}>
          <Text variant="subtitle">Progress</Text>
          <Chip title={`${answeredCount}/${screenData.options.length}`} tone={hasNewOptionsAfterCompletion ? 'orange' : 'blue'} />
        </View>
        <ProgressBar accessibilityLabel="Voting progress" max={screenData.options.length} value={answeredCount} />
        {hasNewOptionsAfterCompletion ? (
          <Text color="textSecondary" variant="caption">
            New options were added after you finished. Vote on the remaining cards to complete again.
          </Text>
        ) : null}
        {isRefreshing ? (
          <Text color="textSecondary" variant="caption">
            Checking for new options...
          </Text>
        ) : null}
      </Card>

      <PlanOptionCard
        description={activeOption.description ?? undefined}
        meta={formatOptionMeta(activeOption)}
        selected={Boolean(activeVote)}
        tag={toLabel(activeOption.category)}
        tagTone={activeVote?.value === 'yes' ? 'green' : activeVote?.value === 'maybe' ? 'yellow' : activeVote?.value === 'no' ? 'red' : 'orange'}
        title={activeOption.title}
      />

      {activeVote ? (
        <Card style={styles.currentVoteCard}>
          <Text color="textSecondary" variant="caption">
            Current vote
          </Text>
          <Text variant="subtitle">{voteLabels[activeVote.value]}</Text>
        </Card>
      ) : null}

      {feedbackMessage ? (
        <View accessibilityLiveRegion="polite" style={styles.messageBox}>
          <Text color={failedVote ? 'nopeCoral' : 'textSecondary'} variant="caption">
            {feedbackMessage}
          </Text>
          {failedVote ? <Button onPress={handleRetryVote} title="Retry save" variant="outline" /> : null}
        </View>
      ) : null}

      <View accessibilityLabel={`Voting actions for ${activeOption.title}`} accessibilityRole="toolbar" style={styles.voteActions}>
        <View style={styles.voteRow}>
          <Button
            accessibilityHint="Saves a yes vote and moves to the next option."
            accessibilityLabel={`Vote yes for ${activeOption.title}`}
            accessibilityState={{ selected: activeVote?.value === 'yes' }}
            disabled={isSavingVote || Boolean(failedVote)}
            fullWidth
            onPress={() => persistVote(activeOption, 'yes', true)}
            style={styles.voteButton}
            title="Yes"
            variant="success"
          />
          <Button
            accessibilityHint="Saves a maybe vote and moves to the next option."
            accessibilityLabel={`Vote maybe for ${activeOption.title}`}
            accessibilityState={{ selected: activeVote?.value === 'maybe' }}
            disabled={isSavingVote || Boolean(failedVote)}
            fullWidth
            onPress={() => persistVote(activeOption, 'maybe', true)}
            style={styles.voteButton}
            title="Maybe"
            variant="secondary"
          />
          <Button
            accessibilityHint="Saves a no vote and moves to the next option."
            accessibilityLabel={`Vote no for ${activeOption.title}`}
            accessibilityState={{ selected: activeVote?.value === 'no' }}
            disabled={isSavingVote || Boolean(failedVote)}
            fullWidth
            onPress={() => persistVote(activeOption, 'no', true)}
            style={styles.voteButton}
            title="No"
            variant="danger"
          />
        </View>
        <Button
          accessibilityHint="Returns to the previous option so you can change your vote."
          disabled={isSavingVote || (history.length === 0 && currentIndex === 0)}
          fullWidth
          onPress={handleUndo}
          title="Undo"
          variant="outline"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: theme.spacing.md,
  },
  currentVoteCard: {
    gap: theme.spacing.xs,
  },
  header: {
    gap: theme.spacing.sm,
  },
  messageBox: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    gap: theme.spacing.md,
    padding: theme.spacing.md,
  },
  progressCard: {
    gap: theme.spacing.md,
  },
  progressHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  skeletonOptionCard: {
    gap: theme.spacing.md,
    minHeight: 260,
  },
  screen: {
    gap: theme.spacing.xl,
    padding: theme.spacing.xl,
  },
  voteActions: {
    gap: theme.spacing.md,
  },
  voteButton: {
    flex: 1,
  },
  voteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    minHeight: 56,
  },
});
