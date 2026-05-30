// src/app/room/[roomId]/itinerary.tsx
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Share, StyleSheet, TextInput, View } from 'react-native';

import { Avatar, Button, Card, Chip, EmptyState, ErrorState, Screen, SkeletonBlock, SkeletonText, Text } from '../../../components';
import { theme } from '../../../constants/theme';
import { useAuth } from '../../../features/auth/AuthProvider';
import { trackAnalyticsEvent } from '../../../lib/analytics';
import {
  addPlanToCalendar,
  formatCalendarDateInput,
  getDefaultCalendarDateRange,
  parseCalendarDateInput,
} from '../../../lib/calendarService';
import { rememberRecentRoom } from '../../../lib/recentRooms';
import { getFriendlyRemoteError } from '../../../lib/remoteErrors';
import { supabase } from '../../../lib/supabase';
import type { BudgetTier, DecisionMode, ParticipantRole, PlanCategory, RoomStatus, VoteValue } from '../../../types/domain';

type ItineraryRouteParams = {
  roomId?: string | string[];
};

type ItineraryRow = {
  backup_plan: string;
  estimated_budget: string;
  estimated_duration: string;
  id: string;
  location_text: string;
  meeting_time: string;
  room_id: string;
  share_text: string;
  steps: string[];
  summary: string;
  title: string;
  winning_option_id: string | null;
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

type RoomRow = {
  budget_tier: BudgetTier;
  category_preferences: PlanCategory[];
  decision_mode: DecisionMode;
  id: string;
  itinerary_id: string | null;
  status: RoomStatus;
  title: string;
  updated_at: string;
};

type VoteRow = {
  participant_id: string;
  value: VoteValue;
};

type ItineraryData = {
  inParticipants: ParticipantRow[];
  itinerary: ItineraryRow;
  maybeParticipants: ParticipantRow[];
  participants: ParticipantRow[];
  room: RoomRow;
};

type ItineraryError = {
  message: string;
  retryable: boolean;
  title: string;
};

type ItineraryAction = 'calendar' | 'copy' | 'save' | 'share';

function getParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function createItineraryError(message: string): ItineraryError {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('permission') || normalizedMessage.includes('auth') || normalizedMessage.includes('participant')) {
    return {
      message: 'Join this room before viewing the final plan.',
      retryable: false,
      title: 'Itinerary access needed',
    };
  }

  if (normalizedMessage.includes('0 rows') || normalizedMessage.includes('not found') || normalizedMessage.includes('not ready')) {
    return {
      message: 'The final plan itinerary has not been created yet.',
      retryable: true,
      title: 'Itinerary not ready',
    };
  }

  const friendlyError = getFriendlyRemoteError(message, 'itinerary_fetch', {
    message: message || 'Check your connection and try again.',
    retryable: true,
    title: 'Unable to load itinerary',
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
    title: 'Unable to load itinerary',
  };
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

function isMissingMeetingTime(meetingTime: string) {
  const normalizedMeetingTime = meetingTime.trim().toLowerCase();

  return normalizedMeetingTime.length === 0 || normalizedMeetingTime === 'time tbd' || normalizedMeetingTime === 'tbd';
}

function buildSupportGroups(participants: ParticipantRow[], votes: VoteRow[]) {
  const supportByParticipantId = new Map(votes.map((vote) => [vote.participant_id, vote.value]));

  return {
    inParticipants: participants.filter((participant) => supportByParticipantId.get(participant.id) === 'yes'),
    maybeParticipants: participants.filter((participant) => supportByParticipantId.get(participant.id) === 'maybe'),
  };
}

function SupportList({
  emptyText,
  participants,
  tone,
}: {
  emptyText: string;
  participants: ParticipantRow[];
  tone: 'blue' | 'green' | 'yellow';
}) {
  if (participants.length === 0) {
    return (
      <Text color="textSecondary" variant="caption">
        {emptyText}
      </Text>
    );
  }

  return (
    <View style={styles.supportList}>
      {participants.map((participant, index) => (
        <View key={participant.id} style={styles.supportRow}>
          <Avatar
            initials={getInitials(participant.display_name)}
            name={participant.display_name}
            size="sm"
            tone={getAvatarTone(index)}
          />
          <Text style={styles.supportName} variant="bodyStrong">
            {participant.display_name}
          </Text>
          <Chip title={participant.role === 'host' ? 'Host' : 'Joined'} tone={tone} />
        </View>
      ))}
    </View>
  );
}

function ItinerarySkeleton() {
  return (
    <Screen contentContainerStyle={styles.screen} padded={false} scroll>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <SkeletonBlock height={30} width="66%" />
          <SkeletonBlock height={16} width="42%" />
        </View>
        <SkeletonBlock height={28} radius="pill" width={104} />
      </View>

      <Card style={styles.heroCard} variant="warm">
        <SkeletonBlock height={24} width="58%" />
        <SkeletonText lines={2} widths={['88%', '62%']} />
      </Card>

      <Card style={styles.detailCard}>
        <SkeletonBlock height={24} width="36%" />
        <View style={styles.detailGrid}>
          {[0, 1, 2, 3].map((item) => (
            <SkeletonBlock height={82} key={item} style={styles.skeletonDetailItem} width={0} />
          ))}
        </View>
      </Card>

      <Card style={styles.stepsCard}>
        <SkeletonBlock height={24} width="24%" />
        {[0, 1, 2].map((item) => (
          <View key={item} style={styles.stepRow}>
            <SkeletonBlock height={32} radius="pill" width={32} />
            <SkeletonBlock height={18} style={styles.stepText} width={0} />
          </View>
        ))}
      </Card>

      <Card style={styles.supportCard}>
        <View style={styles.sectionHeader}>
          <SkeletonBlock height={24} width="48%" />
          <SkeletonBlock height={28} radius="pill" width={96} />
        </View>
        <SkeletonText lines={3} widths={['84%', '72%', '52%']} />
      </Card>
    </Screen>
  );
}

export default function RoomItineraryRoute() {
  const params = useLocalSearchParams<ItineraryRouteParams>();
  const roomId = useMemo(() => getParamValue(params.roomId)?.trim(), [params.roomId]);
  const { isLoading: isAuthLoading, session } = useAuth();
  const trackedItineraryId = useRef<string | undefined>(undefined);
  const [activeAction, setActiveAction] = useState<ItineraryAction | undefined>();
  const [calendarEndText, setCalendarEndText] = useState('');
  const [calendarFallbackVisible, setCalendarFallbackVisible] = useState(false);
  const [calendarStartText, setCalendarStartText] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>();
  const [isSchedulingModalVisible, setIsSchedulingModalVisible] = useState(false);
  const [itineraryData, setItineraryData] = useState<ItineraryData | undefined>();
  const [itineraryError, setItineraryError] = useState<ItineraryError | undefined>();
  const [isLoadingItinerary, setIsLoadingItinerary] = useState(true);
  const finalPlanLink = useMemo(() => (roomId ? Linking.createURL(`/room/${roomId}/itinerary`) : Linking.createURL('/tabs/home')), [roomId]);

  const loadItinerary = useCallback(async () => {
    if (!roomId || !session?.user) {
      setItineraryError({
        message: roomId ? 'Join this room before opening the final plan.' : 'The room link is missing a room id.',
        retryable: false,
        title: roomId ? 'Itinerary access needed' : 'Room unavailable',
      });
      setIsLoadingItinerary(false);
      return;
    }

    setFeedbackMessage(undefined);
    setIsLoadingItinerary(true);

    try {
      const { data: roomData, error: roomError } = await supabase
        .from('plan_rooms')
        .select('id, title, status, itinerary_id, updated_at, budget_tier, category_preferences, decision_mode')
        .eq('id', roomId)
        .single();

      if (roomError) {
        throw new Error(roomError.message);
      }

      const room = roomData as unknown as RoomRow;

      const { data: itineraryRows, error: itineraryFetchError } = await supabase
        .from('itineraries')
        .select('id, room_id, winning_option_id, title, summary, meeting_time, location_text, estimated_budget, estimated_duration, steps, backup_plan, share_text')
        .eq('room_id', roomId)
        .limit(1);

      if (itineraryFetchError) {
        throw new Error(itineraryFetchError.message);
      }

      const itinerary = (itineraryRows?.[0] as unknown as ItineraryRow | undefined) ?? undefined;

      if (!itinerary) {
        throw new Error('Itinerary not ready.');
      }

      const { data: participantData, error: participantError } = await supabase
        .from('plan_participants')
        .select('id, user_id, display_name, avatar_url, role, is_ready, joined_at')
        .eq('room_id', roomId)
        .order('joined_at', { ascending: true });

      if (participantError) {
        throw new Error(participantError.message);
      }

      let votes: VoteRow[] = [];

      if (itinerary.winning_option_id) {
        const { data: voteData, error: voteError } = await supabase
          .from('plan_votes')
          .select('participant_id, value')
          .eq('room_id', roomId)
          .eq('option_id', itinerary.winning_option_id)
          .in('value', ['yes', 'maybe']);

        if (voteError) {
          throw new Error(voteError.message);
        }

        votes = (voteData ?? []) as VoteRow[];
      }

      const participants = (participantData ?? []) as ParticipantRow[];
      const supportGroups = buildSupportGroups(participants, votes);

      setItineraryData({
        ...supportGroups,
        itinerary,
        participants,
        room,
      });
      void rememberRecentRoom({
        id: room.id,
        itineraryId: room.itinerary_id ?? itinerary.id,
        status: room.status,
        title: room.title,
        updatedAt: room.updated_at,
      });
      if (trackedItineraryId.current !== itinerary.id) {
        trackedItineraryId.current = itinerary.id;
        trackAnalyticsEvent({
          name: 'itinerary_viewed',
          properties: {
            budgetTier: room.budget_tier,
            categoryCount: room.category_preferences.length,
            decisionMode: room.decision_mode,
            participantCount: participants.length,
            resultStatus: room.status,
          },
          roomId,
        });
      }
      setItineraryError(undefined);
    } catch (error) {
      setItineraryData(undefined);
      setItineraryError(createItineraryError(error instanceof Error ? error.message : 'Network error.'));
    } finally {
      setIsLoadingItinerary(false);
    }
  }, [roomId, session]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    loadItinerary();
  }, [isAuthLoading, loadItinerary]);

  async function handleShareFinalPlan() {
    if (!itineraryData) {
      return;
    }

    setActiveAction('share');
    setFeedbackMessage(undefined);

    try {
      const result = await Share.share({
        message: itineraryData.itinerary.share_text,
      });

      if (result.action === Share.dismissedAction) {
        setFeedbackMessage('Share canceled.');
        return;
      }

      setFeedbackMessage('Final plan shared.');
      trackAnalyticsEvent({
        name: 'final_plan_shared',
        properties: {
          budgetTier: itineraryData.room.budget_tier,
          categoryCount: itineraryData.room.category_preferences.length,
          decisionMode: itineraryData.room.decision_mode,
          participantCount: itineraryData.participants.length,
          resultStatus: itineraryData.room.status,
          source: 'itinerary',
        },
        roomId: itineraryData.room.id,
      });
    } catch (error) {
      const friendlyError = getFriendlyRemoteError(error, 'share_link', {
        message: 'Sharing is unavailable right now. Use Copy plan as a fallback.',
        retryable: false,
        title: 'Sharing unavailable',
      });

      setFeedbackMessage(friendlyError.message);
    } finally {
      setActiveAction(undefined);
    }
  }

  async function copyFinalPlan() {
    if (!itineraryData) {
      return;
    }

    await Clipboard.setStringAsync(itineraryData.itinerary.share_text);
  }

  async function handleCopyPlan() {
    setActiveAction('copy');
    setFeedbackMessage(undefined);

    try {
      await copyFinalPlan();
      setFeedbackMessage('Final plan copied.');
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : 'Unable to copy the final plan.');
    } finally {
      setActiveAction(undefined);
    }
  }

  async function handleSaveRoom() {
    if (!roomId) {
      return;
    }

    setActiveAction('save');
    setFeedbackMessage(undefined);

    try {
      const { error } = await supabase.rpc('save_room', {
        p_note: null,
        p_room_id: roomId,
      });

      if (error) {
        throw new Error(error.message);
      }

      setFeedbackMessage('Room saved.');
    } catch (error) {
      const friendlyError = getFriendlyRemoteError(error, 'save_room', {
        message: 'Unable to save this room. Check your connection and try again.',
        retryable: true,
        title: 'Room not saved',
      });

      setFeedbackMessage(friendlyError.message);
    } finally {
      setActiveAction(undefined);
    }
  }

  function handleOpenSchedulingModal() {
    if (!itineraryData) {
      return;
    }

    const { endDate, startDate } = getDefaultCalendarDateRange(itineraryData.itinerary.meeting_time, itineraryData.itinerary.estimated_duration);

    setCalendarEndText(formatCalendarDateInput(endDate));
    setCalendarFallbackVisible(false);
    setCalendarStartText(formatCalendarDateInput(startDate));
    setFeedbackMessage(undefined);
    setIsSchedulingModalVisible(true);
  }

  function handleCloseSchedulingModal() {
    setCalendarFallbackVisible(false);
    setIsSchedulingModalVisible(false);
  }

  async function handleAddToCalendar() {
    if (!itineraryData) {
      return;
    }

    const startDate = parseCalendarDateInput(calendarStartText);
    const endDate = parseCalendarDateInput(calendarEndText);

    if (!startDate || !endDate || endDate <= startDate) {
      setFeedbackMessage('Enter a valid start and end time before adding this plan.');
      setCalendarFallbackVisible(false);
      return;
    }

    setActiveAction('calendar');
    setFeedbackMessage(undefined);
    setCalendarFallbackVisible(false);

    try {
      const result = await addPlanToCalendar({
        backupPlan: itineraryData.itinerary.backup_plan,
        budget: itineraryData.itinerary.estimated_budget,
        endDate,
        locationText: itineraryData.itinerary.location_text,
        planTitle: itineraryData.itinerary.title,
        shareLink: finalPlanLink,
        startDate,
        steps: itineraryData.itinerary.steps,
      });

      setFeedbackMessage(result.message);
      setCalendarFallbackVisible(result.status === 'permission_denied' || result.status === 'unavailable');

      if (result.status === 'created') {
        setIsSchedulingModalVisible(false);
      }
    } finally {
      setActiveAction(undefined);
    }
  }

  async function handleCalendarCopyFallback() {
    setActiveAction('copy');

    try {
      await copyFinalPlan();
      setFeedbackMessage('Final plan copied.');
      setCalendarFallbackVisible(false);
      setIsSchedulingModalVisible(false);
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : 'Unable to copy the final plan.');
    } finally {
      setActiveAction(undefined);
    }
  }

  if (isAuthLoading || isLoadingItinerary) {
    return <ItinerarySkeleton />;
  }

  if (itineraryError && !itineraryData) {
    return (
      <Screen centered>
        <ErrorState
          message={itineraryError.message}
          onRetry={itineraryError.retryable ? loadItinerary : undefined}
          retryLabel="Retry"
          title={itineraryError.title}
        />
      </Screen>
    );
  }

  if (!itineraryData) {
    return (
      <Screen centered>
        <EmptyState
          action={<Button onPress={loadItinerary} title="Retry" variant="outline" />}
          message="The final plan is not available yet."
          title="No itinerary yet"
        />
      </Screen>
    );
  }

  const { inParticipants, itinerary, maybeParticipants, participants, room } = itineraryData;
  const missingMeetingTime = isMissingMeetingTime(itinerary.meeting_time);

  return (
    <Screen contentContainerStyle={styles.screen} padded={false} scroll>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text variant="title">{itinerary.title}</Text>
          <Text color="textSecondary">{room.title}</Text>
        </View>
        <Chip title="Final Plan" tone="green" />
      </View>

      <Card style={styles.heroCard} variant="warm">
        <Text variant="subtitle">{itinerary.title}</Text>
        <Text color="textSecondary">{itinerary.summary}</Text>
      </Card>

      {missingMeetingTime ? (
        <Card style={styles.promptCard}>
          <Chip title="Time needed" tone="orange" />
          <Text variant="subtitle">Pick a meeting time</Text>
          <Text color="textSecondary">
            The plan is ready, but the exact time is still TBD. Ask the host to set the meetup time before everyone heads out.
          </Text>
        </Card>
      ) : null}

      <Card style={styles.detailCard}>
        <Text variant="subtitle">Plan Details</Text>
        <View style={styles.detailGrid}>
          <View style={styles.detailItem}>
            <Text color="textSecondary" variant="caption">
              Meeting time
            </Text>
            <Text selectable variant="bodyStrong">
              {itinerary.meeting_time}
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Text color="textSecondary" variant="caption">
              Location
            </Text>
            <Text selectable variant="bodyStrong">
              {itinerary.location_text}
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Text color="textSecondary" variant="caption">
              Budget
            </Text>
            <Text variant="bodyStrong">{itinerary.estimated_budget}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text color="textSecondary" variant="caption">
              Duration
            </Text>
            <Text variant="bodyStrong">{itinerary.estimated_duration}</Text>
          </View>
        </View>
      </Card>

      <Card style={styles.stepsCard}>
        <Text variant="subtitle">Steps</Text>
        <View style={styles.stepList}>
          {itinerary.steps.map((step, index) => (
            <View key={`${step}-${index}`} style={styles.stepRow}>
              <View style={styles.stepNumber}>
                <Text color="afterpartyNavy" variant="caption">
                  {index + 1}
                </Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card style={styles.backupCard} variant="warm">
        <Text variant="subtitle">Backup Plan</Text>
        <Text color="textSecondary">{itinerary.backup_plan}</Text>
      </Card>

      <Card style={styles.supportCard}>
        <View style={styles.sectionHeader}>
          <Text variant="subtitle">Who Is In / Maybe</Text>
          <Chip title={`${participants.length} joined`} tone="blue" />
        </View>
        <View style={styles.supportGroup}>
          <View style={styles.supportHeader}>
            <Text variant="bodyStrong">In</Text>
            <Chip title={`${inParticipants.length}`} tone="green" />
          </View>
          <SupportList emptyText="No one marked a clear yes yet." participants={inParticipants} tone="green" />
        </View>
        <View style={styles.supportGroup}>
          <View style={styles.supportHeader}>
            <Text variant="bodyStrong">Maybe</Text>
            <Chip title={`${maybeParticipants.length}`} tone="yellow" />
          </View>
          <SupportList emptyText="No maybes on the final plan." participants={maybeParticipants} tone="yellow" />
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
        <Button fullWidth loading={activeAction === 'share'} onPress={handleShareFinalPlan} size="lg" title="Share final plan" />
        <Button fullWidth loading={activeAction === 'copy'} onPress={handleCopyPlan} title="Copy plan" variant="secondary" />
        <Button fullWidth loading={activeAction === 'save'} onPress={handleSaveRoom} title="Save room" variant="outline" />
        <Button fullWidth onPress={handleOpenSchedulingModal} title="Add to calendar" variant="outline" />
      </View>

      <Modal
        animationType="fade"
        onRequestClose={handleCloseSchedulingModal}
        transparent
        visible={isSchedulingModalVisible}
      >
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard} variant="warm">
            <View style={styles.modalHeader}>
              <View style={styles.titleGroup}>
                <Text variant="subtitle">Add to Calendar</Text>
                <Text color="textSecondary" variant="caption">
                  Plan Roulette: {itinerary.title}
                </Text>
              </View>
              <Chip title="Optional" tone="blue" />
            </View>

            <View style={styles.field}>
              <Text variant="label">Start</Text>
              <TextInput
                accessibilityLabel="Calendar start time"
                autoCapitalize="none"
                onChangeText={setCalendarStartText}
                placeholder="2026-06-01T18:00"
                placeholderTextColor={theme.colors.sidewalkGray}
                style={styles.input}
                value={calendarStartText}
              />
            </View>

            <View style={styles.field}>
              <Text variant="label">End</Text>
              <TextInput
                accessibilityLabel="Calendar end time"
                autoCapitalize="none"
                onChangeText={setCalendarEndText}
                placeholder="2026-06-01T19:30"
                placeholderTextColor={theme.colors.sidewalkGray}
                style={styles.input}
                value={calendarEndText}
              />
            </View>

            <Text color="textSecondary" variant="caption">
              The calendar note includes the plan steps, budget, backup plan, and final-plan link.
            </Text>

            {calendarFallbackVisible ? (
              <View style={styles.fallbackBox}>
                <Text variant="bodyStrong">Calendar access is unavailable</Text>
                <Text color="textSecondary" variant="caption">
                  Copy the plan and paste it into your calendar app manually.
                </Text>
                <Button
                  fullWidth
                  loading={activeAction === 'copy'}
                  onPress={handleCalendarCopyFallback}
                  title="Copy plan"
                  variant="secondary"
                />
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <Button
                fullWidth
                loading={activeAction === 'calendar'}
                onPress={handleAddToCalendar}
                title="Open calendar"
              />
              <Button fullWidth onPress={handleCloseSchedulingModal} title="Cancel" variant="outline" />
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: theme.spacing.md,
  },
  backupCard: {
    gap: theme.spacing.md,
  },
  detailCard: {
    gap: theme.spacing.md,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  detailItem: {
    backgroundColor: theme.colors.surfaceWarm,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    flexGrow: 1,
    gap: theme.spacing.xs,
    minWidth: 150,
    padding: theme.spacing.md,
  },
  feedbackBox: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    padding: theme.spacing.md,
  },
  fallbackBox: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    gap: theme.spacing.md,
    padding: theme.spacing.md,
  },
  field: {
    gap: theme.spacing.sm,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  heroCard: {
    gap: theme.spacing.md,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    color: theme.colors.textPrimary,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  modalActions: {
    gap: theme.spacing.md,
  },
  modalCard: {
    gap: theme.spacing.lg,
    maxWidth: 520,
    width: '100%',
  },
  modalHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  modalOverlay: {
    backgroundColor: theme.colors.overlay,
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  promptCard: {
    gap: theme.spacing.md,
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
  stepList: {
    gap: theme.spacing.md,
  },
  stepNumber: {
    alignItems: 'center',
    backgroundColor: theme.colors.nachoYellow,
    borderRadius: theme.radius.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  stepRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  stepText: {
    flex: 1,
  },
  skeletonDetailItem: {
    flexGrow: 1,
    minWidth: 150,
  },
  stepsCard: {
    gap: theme.spacing.md,
  },
  supportCard: {
    gap: theme.spacing.lg,
  },
  supportGroup: {
    gap: theme.spacing.md,
  },
  supportHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  supportList: {
    gap: theme.spacing.md,
  },
  supportName: {
    flex: 1,
  },
  supportRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    minHeight: 56,
  },
  titleGroup: {
    flex: 1,
    gap: theme.spacing.xs,
  },
});
