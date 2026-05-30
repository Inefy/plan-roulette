// src/features/auth/AuthActionPanel.tsx
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Text } from '../../components';
import { theme } from '../../constants/theme';
import { useAuth } from './AuthProvider';

type AuthActionPanelProps = {
  description?: string;
  redirectTo?: string;
  showGuestAction?: boolean;
  submitLabel?: string;
  title?: string;
};

function getEmailRedirectTo(redirectTo?: string) {
  if (!redirectTo) {
    return Linking.createURL('/tabs/settings');
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(redirectTo)) {
    return redirectTo;
  }

  return Linking.createURL(redirectTo);
}

export function AuthActionPanel({
  description,
  redirectTo,
  showGuestAction = true,
  submitLabel = 'Send magic link',
  title,
}: AuthActionPanelProps) {
  const { accountState, isLoading, signInAnonymously, signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | undefined>();

  const panelTitle = title ?? (accountState === 'guest' ? 'Save groups with email' : 'Email magic link');
  const panelDescription =
    description ??
    (accountState === 'guest'
      ? 'Attach an email to this guest account to keep rooms and groups across devices.'
      : 'Send a magic link to create or access a permanent account.');

  async function handleEmailSubmit() {
    setStatusMessage(undefined);

    const didSend = await signInWithEmail(email, getEmailRedirectTo(redirectTo));

    if (didSend) {
      setStatusMessage(accountState === 'guest' ? 'Check your email to finish saving this guest account.' : 'Check your email for the magic link.');
    }
  }

  return (
    <Card variant="warm">
      <Text variant="subtitle">{panelTitle}</Text>
      <Text color="textSecondary">{panelDescription}</Text>
      <TextInput
        accessibilityLabel="Email address"
        autoCapitalize="none"
        autoComplete="email"
        inputMode="email"
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor={theme.colors.sidewalkGray}
        style={styles.input}
        value={email}
      />
      <Button disabled={isLoading} fullWidth loading={isLoading} onPress={handleEmailSubmit} title={submitLabel} variant="primary" />
      {statusMessage ? (
        <View accessibilityLiveRegion="polite" style={styles.statusBox}>
          <Text color="textSecondary" variant="caption">
            {statusMessage}
          </Text>
        </View>
      ) : null}
      {showGuestAction && accountState === 'signed_out' ? (
        <Button disabled={isLoading} fullWidth loading={isLoading} onPress={() => signInAnonymously()} title="Continue as guest" variant="secondary" />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
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
  statusBox: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    padding: theme.spacing.md,
  },
});
