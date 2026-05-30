// src/app/create/invite.tsx
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, Screen, Text } from '../../components';
import { theme } from '../../constants/theme';
import { useCreatePlan } from '../../features/create/CreatePlanProvider';
import { trackAnalyticsEvent } from '../../lib/analytics';
import { buildInviteShareMessage } from '../../lib/linkBuilder';
import { getFriendlyRemoteError } from '../../lib/remoteErrors';

type InviteShareMethod = 'copy_link' | 'native_share';

export default function CreateInviteRoute() {
  const router = useRouter();
  const { createdInvite, draft, generatedOptions, resetCreatePlan } = useCreatePlan();
  const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>();
  const [isCopying, setIsCopying] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  function handleStartAnother() {
    resetCreatePlan();
    router.replace('/create');
  }

  function trackInviteShared(method: InviteShareMethod) {
    if (!createdInvite) {
      return;
    }

    trackAnalyticsEvent({
      name: 'invite_shared',
      participantId: createdInvite.participantId,
      properties: {
        budgetTier: draft.budgetTier,
        categoryCount: draft.categories.length,
        decisionMode: 'consensus',
        method,
        optionCount: generatedOptions.length,
      },
      roomId: createdInvite.roomId,
    });
  }

  async function handleShareInvite() {
    if (!createdInvite) {
      return;
    }

    setFeedbackMessage(undefined);
    setIsSharing(true);

    try {
      const result = await Share.share({
        message: buildInviteShareMessage(createdInvite.inviteUrl),
      });

      if (result.action === Share.dismissedAction) {
        setFeedbackMessage('Share canceled.');
        return;
      }

      trackInviteShared('native_share');
      setFeedbackMessage('Invite shared.');
    } catch (error) {
      const friendlyError = getFriendlyRemoteError(error, 'share_link', {
        message: 'Sharing is unavailable right now. The invite link is still available to copy.',
        retryable: false,
        title: 'Sharing unavailable',
      });

      setFeedbackMessage(friendlyError.message);
    } finally {
      setIsSharing(false);
    }
  }

  async function handleCopyLink() {
    if (!createdInvite) {
      return;
    }

    setFeedbackMessage(undefined);
    setIsCopying(true);

    try {
      await Clipboard.setStringAsync(createdInvite.inviteUrl);
      trackInviteShared('copy_link');
      setFeedbackMessage('Invite link copied.');
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : 'Unable to copy this invite link.');
    } finally {
      setIsCopying(false);
    }
  }

  if (!createdInvite) {
    return (
      <Screen centered>
        <EmptyState
          action={<Button onPress={() => router.replace('/create')} title="Create a plan" />}
          message="Create a room first, then the invite link will appear here."
          title="No invite yet"
        />
      </Screen>
    );
  }

  return (
    <Screen contentContainerStyle={styles.screen} padded={false} scroll>
      <View style={styles.header}>
        <Text variant="title">Invite Friends</Text>
        <Text color="textSecondary">The room is ready with the generated option deck.</Text>
      </View>

      <Card style={styles.inviteCard} variant="warm">
        <View style={styles.inviteBlock}>
          <Text color="textSecondary" variant="caption">
            Invite link
          </Text>
          <Text selectable style={styles.inviteText} variant="bodyStrong">
            {createdInvite.inviteUrl}
          </Text>
        </View>

        <View style={styles.detailGrid}>
          <View style={styles.detailItem}>
            <Text color="textSecondary" variant="caption">
              Token
            </Text>
            <Text selectable variant="bodyStrong">
              {createdInvite.inviteToken}
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Text color="textSecondary" variant="caption">
              Room ID
            </Text>
            <Text selectable variant="bodyStrong">
              {createdInvite.roomId}
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
        <Button fullWidth loading={isSharing} onPress={handleShareInvite} size="lg" title="Share invite" />
        <Button fullWidth loading={isCopying} onPress={handleCopyLink} title="Copy link" variant="secondary" />
        <Button fullWidth onPress={() => router.replace(`/room/${createdInvite.roomId}`)} size="lg" title="Go to room" />
        <Button fullWidth onPress={handleStartAnother} title="Start another plan" variant="outline" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: theme.spacing.md,
  },
  detailGrid: {
    gap: theme.spacing.md,
  },
  detailItem: {
    gap: theme.spacing.xs,
  },
  feedbackBox: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    padding: theme.spacing.md,
  },
  header: {
    gap: theme.spacing.sm,
  },
  inviteBlock: {
    gap: theme.spacing.sm,
  },
  inviteCard: {
    gap: theme.spacing.xl,
  },
  inviteText: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    padding: theme.spacing.md,
  },
  screen: {
    gap: theme.spacing.xl,
    padding: theme.spacing.xl,
  },
});
