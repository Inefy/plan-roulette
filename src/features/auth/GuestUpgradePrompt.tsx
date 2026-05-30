// src/features/auth/GuestUpgradePrompt.tsx
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Text } from '../../components';
import { theme } from '../../constants/theme';
import { useAuth } from './AuthProvider';

type GuestUpgradePromptProps = {
  redirectTo: string;
};

export function GuestUpgradePrompt({ redirectTo }: GuestUpgradePromptProps) {
  const router = useRouter();
  const { isGuest } = useAuth();

  if (!isGuest) {
    return null;
  }

  function handleUpgradePress() {
    router.push(`/auth/sign-in?mode=upgrade&redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  return (
    <Card accessibilityLabel="Save your groups for next time" style={styles.card} variant="outlined">
      <View style={styles.copy}>
        <Text variant="bodyStrong">Save your groups for next time</Text>
        <Text color="textSecondary" variant="caption">
          Add an email to keep this room, your groups, and your plan history across devices.
        </Text>
      </View>
      <Button accessibilityLabel="Add an email to save this guest account" fullWidth onPress={handleUpgradePress} title="Add email" variant="ghost" />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.md,
  },
  copy: {
    gap: theme.spacing.xs,
  },
});
