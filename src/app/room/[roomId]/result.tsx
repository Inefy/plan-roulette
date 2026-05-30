// src/app/room/[roomId]/result.tsx
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Share, StyleSheet, View } from 'react-native';

import { Button, Card, Chip, EmptyState, ErrorState, ProgressBar, Screen, SkeletonBlock, SkeletonText, Text } from '../../../components';
import { WinnerCard } from '../../../features/plan/components';
import { theme } from '../../../constants/theme';
import { useAuth } from '../../../features/auth/AuthProvider';
import { GuestUpgradePrompt } from '../../../features/auth/GuestUpgradePrompt';
import { trackAnalyticsEvent } from '../../../lib/analytics';
import { rememberRecentRoom } from '../../../lib/recentRooms';
import { getFriendlyRemoteError } from '../../../lib/remoteErrors';
import { generateCompromiseOptions, hostDecideWinner, RoomFinalizationError, startTopTwoRunoff } from '../../../lib/roomFinalizer';
import { supabase } from '../../../lib/supabase';
import type { ConsensusOutcome, DecisionMode, ParticipantRole, PlanCategory, RoomStatus, VoteValue } from '../../../types/domain';
import { toDisplayLabel } from '../../../utils/displayLabels';

type ResultRouteParams = {
  roomId?: string | string[];
};

type ResultRow = {
  decided_at: string | null;
  decision_mode: DecisionMode;
  id: string;
  no_consensus: boolean;
  outcome: ConsensusOutcome;
  reason: string | null;
  room_id: string;
  score_breakdown: unknown;
  tied_option_ids: string[];
  vote_counts_by_option_id: unknown;
  winning_option_id: string | null;
};

type OptionRow = {
  category: PlanCategory;
  description: string | null;
  id: string;
  share_summary: string | null;
  title: string;
};

type ItineraryRow = {
  estimated_budget: string;
  estimated_duration: string;
  id: string;
  location_text: string;
  meeting_time: string;
  share_text: string;
  title: string;
};

type RoomRow = {
  id: string;
  itinerary_id: string | null;
  status: RoomStatus;
  title: string;
  updated_at: string;
};

type ResultScreenData = {
  itinerary?: ItineraryRow;
  participantCount: number;
  result: ResultRow;
  room: RoomRow;
  topOptions: OptionRow[];
  userRole?: ParticipantRole;
  winningOption?: OptionRow;
};

type ResultScreenError = {
  message: string;
  retryable: boolean;
  title: string;
};

type VoteBreakdown = Record<VoteValue, number>;

type ScoreBreakdownRow = {
  constraintMatchScore?: number;
  noCount?: number;
  optionId?: string;
  participantCount?: number;
  skipCount?: number;
  totalScore?: number;
  votedParticipantCount?: number;
  voteCounts?: Partial<VoteBreakdown>;
  yesCount?: number;
};

type RecoveryAction = 'compromise' | 'host' | 'runoff';

const emptyBreakdown: VoteBreakdown = {
  maybe: 0,
  no: 0,
  skip: 0,
  yes: 0,
};

function getParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function toLabel(value: string) {
  return toDisplayLabel(value);
}

function createResultError(message: string): ResultScreenError {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('permission') || normalizedMessage.includes('auth') || normalizedMessage.includes('participant')) {
    return {
      message: 'Join this room before viewing the result.',
      retryable: false,
      title: 'Result access needed',
    };
  }

  if (normalizedMessage.includes('0 rows') || normalizedMessage.includes('not found')) {
    return {
      message: 'The host has not picked a winner yet.',
      retryable: true,
      title: 'Result pending',
    };
  }

  const friendlyError = getFriendlyRemoteError(message, 'result_fetch', {
    message: message || 'Check your connection and try again.',
    retryable: true,
    title: 'Unable to load result',
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
    title: 'Unable to load result',
  };
}

function normalizeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeVoteBreakdown(value: unknown): VoteBreakdown {
  if (!value || typeof value !== 'object') {
    return emptyBreakdown;
  }

  const rawBreakdown = value as Partial<Record<VoteValue, unknown>>;

  return {
    maybe: normalizeNumber(rawBreakdown.maybe),
    no: normalizeNumber(rawBreakdown.no),
    skip: normalizeNumber(rawBreakdown.skip),
    yes: normalizeNumber(rawBreakdown.yes),
  };
}

function getVoteBreakdown(result: ResultRow) {
  const winningOptionId = result.winning_option_id ?? result.tied_option_ids[0];

  if (!winningOptionId || !result.vote_counts_by_option_id || typeof result.vote_counts_by_option_id !== 'object') {
    return emptyBreakdown;
  }

  const byOptionId = result.vote_counts_by_option_id as Record<string, unknown>;

  return normalizeVoteBreakdown(byOptionId[winningOptionId]);
}

function getScoreBreakdown(result: ResultRow) {
  const targetOptionId = result.winning_option_id ?? result.tied_option_ids[0];

  if (!targetOptionId || !Array.isArray(result.score_breakdown)) {
    return undefined;
  }

  return result.score_breakdown.find((row): row is ScoreBreakdownRow => {
    return Boolean(row && typeof row === 'object' && (row as ScoreBreakdownRow).optionId === targetOptionId);
  });
}

function rankScoreBreakdowns(result: ResultRow) {
  if (!Array.isArray(result.score_breakdown)) {
    return [];
  }

  return [...result.score_breakdown]
    .filter((row): row is ScoreBreakdownRow => Boolean(row && typeof row === 'object' && (row as ScoreBreakdownRow).optionId))
    .sort((left, right) => {
      const leftNoCount = left.noCount ?? 0;
      const rightNoCount = right.noCount ?? 0;
      const leftYesCount = left.yesCount ?? 0;
      const rightYesCount = right.yesCount ?? 0;
      const leftTotalScore = left.totalScore ?? 0;
      const rightTotalScore = right.totalScore ?? 0;
      const leftConstraintScore = left.constraintMatchScore ?? 0;
      const rightConstraintScore = right.constraintMatchScore ?? 0;

      return (
        leftNoCount - rightNoCount ||
        rightYesCount - leftYesCount ||
        rightTotalScore - leftTotalScore ||
        rightConstraintScore - leftConstraintScore ||
        String(left.optionId).localeCompare(String(right.optionId))
      );
    });
}

function getTopOptionIds(result: ResultRow) {
  const rankedIds = rankScoreBreakdowns(result)
    .map((breakdown) => breakdown.optionId)
    .filter((optionId): optionId is string => Boolean(optionId));
  const tiedIds = result.tied_option_ids ?? [];

  return [...new Set([...tiedIds, ...rankedIds])].slice(0, 2);
}

function getSupportTotal(breakdown: VoteBreakdown) {
  return breakdown.yes + breakdown.maybe + breakdown.no + breakdown.skip;
}

function getOutcomeLabel(result: ResultRow) {
  if (result.outcome === 'winner_selected') {
    return 'Winner Picked';
  }

  if (result.outcome === 'tie') {
    return 'Tie';
  }

  if (result.outcome === 'no_consensus') {
    return 'No Consensus';
  }

  return 'Pending';
}

function getShareMessage(data: ResultScreenData) {
  if (data.itinerary?.share_text) {
    return data.itinerary.share_text;
  }

  if (data.winningOption) {
    return `Plan Roulette picked ${data.winningOption.title}. ${data.result.reason ?? ''}`.trim();
  }

  return `Plan Roulette needs a runoff for ${data.room.title}. ${data.result.reason ?? ''}`.trim();
}

function getConflictSummary(data: ResultScreenData) {
  const rankedBreakdowns = rankScoreBreakdowns(data.result);
  const top = rankedBreakdowns[0];
  const runnerUp = rankedBreakdowns[1];

  if (data.result.outcome === 'tie' || data.result.tied_option_ids.length > 1) {
    return 'The closest options landed almost even. A short runoff can make the next choice easier.';
  }

  if (!top || (top.yesCount ?? 0) + normalizeNumber(top.voteCounts?.maybe) === 0) {
    return 'The room did not have a clear yes or maybe signal yet. A softer compromise round may help.';
  }

  if (runnerUp && (top.noCount ?? 0) > 0) {
    return 'There is some support, but also a few reservations. Narrowing the field keeps the next vote low-pressure.';
  }

  return 'The group is close, but not quite settled. Pick a recovery path that keeps the decision moving.';
}

function triggerLightHaptic() {
  Haptics.selectionAsync().catch(() => undefined);
}

function ResultSkeleton() {
  return (
    <Screen contentContainerStyle={styles.screen} padded={false} scroll>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <SkeletonBlock height={30} width="62%" />
          <SkeletonBlock height={16} width="36%" />
        </View>
        <SkeletonBlock height={28} radius="pill" width={120} />
      </View>

      <Card style={styles.noWinnerCard} variant="warm">
        <SkeletonBlock height={28} radius="pill" width={104} />
        <SkeletonBlock height={30} width="70%" />
        <SkeletonText lines={2} widths={['84%', '64%']} />
      </Card>

      <Card style={styles.detailsCard}>
        <SkeletonBlock height={24} width="36%" />
        <SkeletonText lines={3} widths={['94%', '82%', '46%']} />
        <View style={styles.scoreGrid}>
          <SkeletonBlock height={84} style={styles.skeletonScoreItem} width={0} />
          <SkeletonBlock height={84} style={styles.skeletonScoreItem} width={0} />
          <SkeletonBlock height={84} style={styles.skeletonScoreItem} width={0} />
        </View>
      </Card>

      <Card style={styles.breakdownCard} variant="warm">
        <View style={styles.sectionHeader}>
          <SkeletonBlock height={24} width="42%" />
          <SkeletonBlock height={28} radius="pill" width={96} />
        </View>
        {[0, 1, 2].map((item) => (
          <View key={item} style={styles.breakdownRow}>
            <SkeletonBlock height={16} width={56} />
            <View style={styles.breakdownProgress}>
              <SkeletonBlock height={10} radius="pill" />
            </View>
            <SkeletonBlock height={16} width={24} />
          </View>
        ))}
      </Card>
    </Screen>
  );
}

export default function RoomResultRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<ResultRouteParams>();
  const roomId = useMemo(() => getParamValue(params.roomId)?.trim(), [params.roomId]);
  const { isLoading: isAuthLoading, session } = useAuth();
  const spinValue = useRef(new Animated.Value(0)).current;
  const hapticPlayedForResultId = useRef<string | undefined>(undefined);
  const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>();
  const [hostDecisionOptionId, setHostDecisionOptionId] = useState<string | undefined>();
  const [isLoadingResult, setIsLoadingResult] = useState(true);
  const [isReducedMotionEnabled, setIsReducedMotionEnabled] = useState(false);
  const [recoveryAction, setRecoveryAction] = useState<RecoveryAction | undefined>();
  const [resultData, setResultData] = useState<ResultScreenData | undefined>();
  const [resultError, setResultError] = useState<ResultScreenError | undefined>();
  const [showResult, setShowResult] = useState(false);

  const loadResult = useCallback(async () => {
    if (!roomId || !session?.user) {
      setResultError({
        message: roomId ? 'Join this room before viewing the result.' : 'The room link is missing a room id.',
        retryable: false,
        title: roomId ? 'Result access needed' : 'Room unavailable',
      });
      setIsLoadingResult(false);
      return;
    }

    setFeedbackMessage(undefined);
    setHostDecisionOptionId(undefined);
    setIsLoadingResult(true);
    setShowResult(false);

    try {
      const { data: roomData, error: roomError } = await supabase
        .from('plan_rooms')
        .select('id, title, status, itinerary_id, updated_at')
        .eq('id', roomId)
        .single();

      if (roomError) {
        throw new Error(roomError.message);
      }

      const room = roomData as unknown as RoomRow;

      void rememberRecentRoom({
        id: room.id,
        itineraryId: room.itinerary_id,
        status: room.status,
        title: room.title,
        updatedAt: room.updated_at,
      });

      const { data: resultRows, error: resultFetchError } = await supabase
        .from('plan_results')
        .select('id, room_id, decision_mode, outcome, winning_option_id, tied_option_ids, vote_counts_by_option_id, score_breakdown, no_consensus, reason, decided_at')
        .eq('room_id', roomId)
        .limit(1);

      if (resultFetchError) {
        throw new Error(resultFetchError.message);
      }

      const result = (resultRows?.[0] as unknown as ResultRow | undefined) ?? undefined;

      if (!result) {
        throw new Error('Result not found.');
      }

      let topOptions: OptionRow[] = [];
      let winningOption: OptionRow | undefined;
      const topOptionIds = getTopOptionIds(result);
      const optionIdsToFetch = [...new Set([result.winning_option_id, ...topOptionIds].filter((optionId): optionId is string => Boolean(optionId)))];

      if (optionIdsToFetch.length > 0) {
        const { data: optionData, error: optionError } = await supabase
          .from('plan_options')
          .select('id, title, description, category, share_summary')
          .in('id', optionIdsToFetch);

        if (optionError) {
          throw new Error(optionError.message);
        }

        const optionsById = new Map(((optionData ?? []) as unknown as OptionRow[]).map((option) => [option.id, option]));

        winningOption = result.winning_option_id ? optionsById.get(result.winning_option_id) : undefined;
        topOptions = topOptionIds.map((optionId) => optionsById.get(optionId)).filter((option): option is OptionRow => Boolean(option));
      }

      const { data: itineraryRows, error: itineraryError } = await supabase
        .from('itineraries')
        .select('id, title, meeting_time, location_text, estimated_budget, estimated_duration, share_text')
        .eq('room_id', roomId)
        .limit(1);

      if (itineraryError) {
        throw new Error(itineraryError.message);
      }

      const { count: participantCount, error: participantError } = await supabase
        .from('plan_participants')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', roomId);

      if (participantError) {
        throw new Error(participantError.message);
      }

      const { data: currentParticipantRows, error: currentParticipantError } = await supabase
        .from('plan_participants')
        .select('role')
        .eq('room_id', roomId)
        .eq('user_id', session.user.id)
        .limit(1);

      if (currentParticipantError) {
        throw new Error(currentParticipantError.message);
      }

      setResultData({
        itinerary: (itineraryRows?.[0] as unknown as ItineraryRow | undefined) ?? undefined,
        participantCount: participantCount ?? 0,
        result,
        room,
        topOptions,
        userRole: ((currentParticipantRows?.[0] as { role?: ParticipantRole } | undefined)?.role as ParticipantRole | undefined) ?? undefined,
        winningOption,
      });
      setResultError(undefined);
    } catch (error) {
      setResultData(undefined);
      setResultError(createResultError(error instanceof Error ? error.message : 'Network error.'));
    } finally {
      setIsLoadingResult(false);
    }
  }, [roomId, session]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setIsReducedMotionEnabled).catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setIsReducedMotionEnabled);

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    loadResult();
  }, [isAuthLoading, loadResult]);

  useEffect(() => {
    if (!resultData) {
      return undefined;
    }

    if (isReducedMotionEnabled) {
      setShowResult(true);
      return undefined;
    }

    spinValue.setValue(0);

    const animation = Animated.loop(
      Animated.timing(spinValue, {
        duration: 700,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
    );
    const timeoutId = setTimeout(() => {
      animation.stop();
      setShowResult(true);
    }, 1200);

    animation.start();

    return () => {
      clearTimeout(timeoutId);
      animation.stop();
    };
  }, [isReducedMotionEnabled, resultData, spinValue]);

  useEffect(() => {
    if (!showResult || !resultData || hapticPlayedForResultId.current === resultData.result.id) {
      return;
    }

    hapticPlayedForResultId.current = resultData.result.id;
    triggerLightHaptic();
  }, [resultData, showResult]);

  async function handleShareFinalPlan() {
    if (!resultData) {
      return;
    }

    setFeedbackMessage(undefined);

    try {
      const shareResult = await Share.share({
        message: getShareMessage(resultData),
      });

      if (shareResult.action === Share.dismissedAction) {
        setFeedbackMessage('Share canceled.');
        return;
      }

      trackAnalyticsEvent({
        name: 'final_plan_shared',
        properties: {
          decisionMode: resultData.result.decision_mode,
          participantCount: resultData.participantCount,
          resultStatus: resultData.result.outcome,
          source: 'result',
        },
        roomId: resultData.room.id,
      });
      setFeedbackMessage('Final plan shared.');
    } catch (error) {
      const friendlyError = getFriendlyRemoteError(error, 'share_link', {
        message: 'Sharing is unavailable right now. Try again or open the itinerary to copy the plan.',
        retryable: false,
        title: 'Sharing unavailable',
      });

      setFeedbackMessage(friendlyError.message);
    }
  }

  async function handleRunoff() {
    if (!resultData || !roomId || resultData.topOptions.length < 2) {
      setFeedbackMessage('A runoff needs two close options first.');
      return;
    }

    setFeedbackMessage(undefined);
    setRecoveryAction('runoff');

    try {
      await startTopTwoRunoff(roomId, resultData.topOptions.map((option) => option.id));
      router.replace(`/room/${roomId}/vote`);
    } catch (error) {
      const friendlyError = getFriendlyRemoteError(error, 'close_voting', {
        message: 'Unable to start a runoff. Check your connection and try again.',
        retryable: true,
        title: 'Runoff unavailable',
      });

      setFeedbackMessage(friendlyError.message);
    } finally {
      setRecoveryAction(undefined);
    }
  }

  async function handleGenerateCompromiseOptions() {
    if (!resultData || !roomId) {
      return;
    }

    setFeedbackMessage(undefined);
    setRecoveryAction('compromise');

    try {
      await generateCompromiseOptions(roomId, resultData.topOptions.map((option) => option.id));
      router.replace(`/room/${roomId}/vote`);
    } catch (error) {
      const friendlyError = getFriendlyRemoteError(error, 'close_voting', {
        message: 'Unable to generate compromise options. Check your connection and try again.',
        retryable: true,
        title: 'Compromise unavailable',
      });

      setFeedbackMessage(friendlyError.message);
    } finally {
      setRecoveryAction(undefined);
    }
  }

  async function handleHostDecides(optionId: string) {
    if (!resultData || !roomId) {
      setFeedbackMessage('Choose an available top option before the host decides.');
      return;
    }

    const selectedOption = resultData.topOptions.find((option) => option.id === optionId);

    if (!selectedOption) {
      setFeedbackMessage('Choose one of the close options before the host decides.');
      return;
    }

    setFeedbackMessage(undefined);
    setHostDecisionOptionId(optionId);
    setRecoveryAction('host');

    try {
      await hostDecideWinner(roomId, selectedOption.id);
      await loadResult();
    } catch (error) {
      if (error instanceof RoomFinalizationError && error.kind === 'permission') {
        setFeedbackMessage(error.message);
      } else {
        setFeedbackMessage(error instanceof Error ? error.message : 'Unable to save the host decision.');
      }
    } finally {
      setHostDecisionOptionId(undefined);
      setRecoveryAction(undefined);
    }
  }

  if (isAuthLoading || isLoadingResult) {
    return <ResultSkeleton />;
  }

  if (resultError && !resultData) {
    return (
      <Screen centered>
        <ErrorState
          message={resultError.message}
          onRetry={resultError.retryable ? loadResult : undefined}
          retryLabel="Retry"
          title={resultError.title}
        />
      </Screen>
    );
  }

  if (!resultData) {
    return (
      <Screen centered>
        <EmptyState
          action={<Button onPress={loadResult} title="Retry" variant="outline" />}
          message="The result has not been stored yet."
          title="No result yet"
        />
      </Screen>
    );
  }

  const rotation = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const breakdown = getVoteBreakdown(resultData.result);
  const supportTotal = Math.max(getSupportTotal(breakdown), 1);
  const scoreBreakdown = getScoreBreakdown(resultData.result);
  const winningOption = resultData.result.outcome === 'winner_selected' ? resultData.winningOption : undefined;
  const isHost = resultData.userRole === 'host';

  if (!showResult) {
    return (
      <Screen contentContainerStyle={styles.spinnerScreen} padded={false}>
        <Animated.View style={[styles.rouletteWheel, { transform: [{ rotate: rotation }] }]}>
          <View style={[styles.wheelSlice, styles.redSlice]} />
          <View style={[styles.wheelSlice, styles.yellowSlice]} />
          <View style={[styles.wheelSlice, styles.blueSlice]} />
          <View style={styles.wheelCenter}>
            <Text color="textInverse" variant="title">
              ?
            </Text>
          </View>
        </Animated.View>
        <Text align="center" variant="subtitle">
          Spinning the result
        </Text>
        <Text align="center" color="textSecondary">
          Checking the group vote and picking the final plan.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen contentContainerStyle={styles.screen} padded={false} scroll>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text variant="title">{resultData.room.title}</Text>
          <Text color="textSecondary">Final result</Text>
        </View>
        <Chip title={getOutcomeLabel(resultData.result)} tone={winningOption ? 'yellow' : 'orange'} />
      </View>

      {winningOption ? (
        <WinnerCard
          actionLabel="View itinerary"
          detail={resultData.result.reason ?? undefined}
          onActionPress={() => router.push(`/room/${resultData.room.id}/itinerary`)}
          subtitle={winningOption.description ?? resultData.itinerary?.meeting_time}
          title={winningOption.title}
        />
      ) : (
        <Card style={styles.noWinnerCard} variant="warm">
          <Chip title={getOutcomeLabel(resultData.result)} tone="orange" />
          <Text align="center" variant="title">
            No clear winner yet
          </Text>
          <Text align="center" color="textSecondary">
            {getConflictSummary(resultData)}
          </Text>
          {resultData.result.tied_option_ids.length > 1 ? (
            <Text align="center" color="textSecondary" variant="caption">
              {resultData.result.tied_option_ids.length} options are tied.
            </Text>
          ) : null}
        </Card>
      )}

      <GuestUpgradePrompt redirectTo={`/room/${resultData.room.id}/result`} />

      {!winningOption ? (
        <Card style={styles.recoveryCard}>
          <Text variant="subtitle">Closest Options</Text>
          <Text color="textSecondary">These are the strongest choices so far. Nobody has to be wrong; the room just needs a smaller next step.</Text>
          <View style={styles.topOptionList}>
            {resultData.topOptions.map((option, index) => (
              <View key={option.id} style={styles.topOptionRow}>
                <Chip title={`#${index + 1}`} tone={index === 0 ? 'yellow' : 'blue'} />
                <View style={styles.topOptionText}>
                  <Text variant="bodyStrong">{option.title}</Text>
                  <Text color="textSecondary" variant="caption">
                    {option.description ?? toLabel(option.category)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Card style={styles.detailsCard}>
        <Text variant="subtitle">{winningOption ? 'Why it won' : 'What happened'}</Text>
        <Text color="textSecondary">{resultData.result.reason ?? 'The option ranked highest after the group vote.'}</Text>
        {scoreBreakdown ? (
          <View style={styles.scoreGrid}>
            <View style={styles.scoreItem}>
              <Text variant="subtitle">{scoreBreakdown.totalScore ?? 0}</Text>
              <Text color="textSecondary" variant="caption">
                score
              </Text>
            </View>
            <View style={styles.scoreItem}>
              <Text variant="subtitle">{scoreBreakdown.votedParticipantCount ?? 0}/{resultData.participantCount}</Text>
              <Text color="textSecondary" variant="caption">
                voted
              </Text>
            </View>
            <View style={styles.scoreItem}>
              <Text variant="subtitle">{scoreBreakdown.constraintMatchScore ?? 0}</Text>
              <Text color="textSecondary" variant="caption">
                fit
              </Text>
            </View>
          </View>
        ) : null}
      </Card>

      <Card style={styles.breakdownCard} variant="warm">
        <View style={styles.sectionHeader}>
          <Text variant="subtitle">Vote Breakdown</Text>
          <Chip title={`${resultData.participantCount} people`} tone="blue" />
        </View>
        <View style={styles.breakdownRows}>
          <View style={styles.breakdownRow}>
            <Text variant="label">Yes</Text>
            <View style={styles.breakdownProgress}>
              <ProgressBar color="goGreen" max={supportTotal} value={breakdown.yes} />
            </View>
            <Text color="textSecondary" variant="caption">
              {breakdown.yes}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text variant="label">Maybe</Text>
            <View style={styles.breakdownProgress}>
              <ProgressBar color="nachoYellow" max={supportTotal} value={breakdown.maybe} />
            </View>
            <Text color="textSecondary" variant="caption">
              {breakdown.maybe}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text variant="label">No</Text>
            <View style={styles.breakdownProgress}>
              <ProgressBar color="nopeCoral" max={supportTotal} value={breakdown.no} />
            </View>
            <Text color="textSecondary" variant="caption">
              {breakdown.no}
            </Text>
          </View>
        </View>
      </Card>

      {feedbackMessage ? (
        <View accessibilityLiveRegion="polite" style={styles.feedbackBox}>
          <Text color="textSecondary" variant="caption">
            {feedbackMessage}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          disabled={!resultData.itinerary}
          fullWidth
          onPress={() => router.push(`/room/${resultData.room.id}/itinerary`)}
          size="lg"
          title="View itinerary"
        />
        <Button fullWidth onPress={handleShareFinalPlan} title="Share final plan" variant="secondary" />
        {!winningOption ? (
          <>
            <Button
              disabled={!isHost || recoveryAction !== undefined || resultData.topOptions.length < 2}
              fullWidth
              loading={recoveryAction === 'runoff'}
              onPress={handleRunoff}
              title="Run top 2 runoff"
              variant="outline"
            />
            <Button
              disabled={!isHost || recoveryAction !== undefined}
              fullWidth
              loading={recoveryAction === 'compromise'}
              onPress={handleGenerateCompromiseOptions}
              title="Generate compromise options"
              variant="secondary"
            />
            {isHost ? (
              <View style={styles.hostDecisionPanel}>
                <Text variant="label">Host decides</Text>
                <Text color="textSecondary" variant="caption">
                  Make a final call from the close options when a fresh vote is not needed.
                </Text>
                {resultData.topOptions.map((option, index) => (
                  <Button
                    accessibilityLabel={`Host decides ${option.title}`}
                    disabled={recoveryAction !== undefined}
                    fullWidth
                    key={option.id}
                    loading={recoveryAction === 'host' && hostDecisionOptionId === option.id}
                    onPress={() => handleHostDecides(option.id)}
                    title={`Pick #${index + 1}`}
                    variant="outline"
                  />
                ))}
              </View>
            ) : null}
            {!isHost ? (
              <Text align="center" color="textSecondary" variant="caption">
                Ask the host to choose a recovery path.
              </Text>
            ) : null}
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: theme.spacing.md,
  },
  blueSlice: {
    backgroundColor: theme.colors.poolBlue,
    bottom: 0,
    height: '50%',
    left: 0,
    width: '50%',
  },
  breakdownCard: {
    gap: theme.spacing.md,
  },
  breakdownRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  breakdownProgress: {
    flex: 1,
    minWidth: 80,
  },
  breakdownRows: {
    gap: theme.spacing.md,
  },
  detailsCard: {
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
  noWinnerCard: {
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.xl,
  },
  hostDecisionPanel: {
    gap: theme.spacing.sm,
  },
  redSlice: {
    backgroundColor: theme.colors.rouletteRed,
    height: '50%',
    left: 0,
    top: 0,
    width: '50%',
  },
  rouletteWheel: {
    alignItems: 'center',
    backgroundColor: theme.colors.afterpartyNavy,
    borderColor: theme.colors.afterpartyNavy,
    borderRadius: 80,
    borderWidth: 6,
    height: 160,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 160,
  },
  scoreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  scoreItem: {
    backgroundColor: theme.colors.surfaceWarm,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    flexGrow: 1,
    gap: theme.spacing.xs,
    minWidth: 96,
    padding: theme.spacing.md,
  },
  skeletonScoreItem: {
    flexGrow: 1,
    minWidth: 96,
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
  spinnerScreen: {
    alignItems: 'center',
    flex: 1,
    gap: theme.spacing.lg,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  titleGroup: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  recoveryCard: {
    gap: theme.spacing.md,
  },
  topOptionList: {
    gap: theme.spacing.md,
  },
  topOptionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  topOptionText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  wheelCenter: {
    alignItems: 'center',
    backgroundColor: theme.colors.afterpartyNavy,
    borderColor: theme.colors.warmPaper,
    borderRadius: 36,
    borderWidth: 3,
    height: 72,
    justifyContent: 'center',
    position: 'absolute',
    width: 72,
  },
  wheelSlice: {
    position: 'absolute',
  },
  yellowSlice: {
    backgroundColor: theme.colors.nachoYellow,
    height: '50%',
    right: 0,
    top: 0,
    width: '50%',
  },
});
