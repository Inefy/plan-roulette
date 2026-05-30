// src/app/tabs/settings.tsx
import { StyleSheet, View } from 'react-native';

import { Button, Card, Chip, ErrorState, LoadingState, Screen, Text } from '../../components';
import { theme } from '../../constants/theme';
import { AuthActionPanel } from '../../features/auth/AuthActionPanel';
import { useAuth } from '../../features/auth/AuthProvider';

export default function SettingsRoute() {
  const { accountState, errorMessage, isGuest, isLoading, signInAnonymously, signOut, user } = useAuth();

  if (isLoading && accountState === 'loading') {
    return (
      <Screen centered>
        <LoadingState message="Checking account..." />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.stack}>
        <View style={styles.header}>
          <Text variant="title">Settings</Text>
          <Chip title={accountState === 'signed_in' ? 'Signed in' : accountState === 'guest' ? 'Guest' : 'Signed out'} tone={isGuest ? 'yellow' : 'blue'} />
        </View>

        {errorMessage ? <ErrorState message={errorMessage} title="Account action failed" /> : null}

        <Card variant="elevated">
          <Text variant="subtitle">Account</Text>
          <Text color="textSecondary">
            {accountState === 'signed_in'
              ? `Signed in as ${user?.email ?? 'your permanent account'}.`
              : accountState === 'guest'
                ? 'Using an anonymous guest account for room participation.'
                : 'Sign in as a guest or send yourself an email magic link.'}
          </Text>

          {accountState === 'signed_out' ? (
            <Button disabled={isLoading} fullWidth loading={isLoading} onPress={() => signInAnonymously()} title="Continue as guest" variant="secondary" />
          ) : null}

          {accountState !== 'signed_out' ? (
            <Button disabled={isLoading} fullWidth loading={isLoading} onPress={signOut} title="Sign out" variant="outline" />
          ) : null}
        </Card>

        <AuthActionPanel
          description={
            accountState === 'guest'
              ? 'Attach an email to this guest account so your saved rooms and groups are available next time.'
              : 'Send a magic link to create or access a permanent account.'
          }
          redirectTo="/tabs/settings"
          showGuestAction={false}
          submitLabel={accountState === 'guest' ? 'Send upgrade link' : 'Send magic link'}
          title={accountState === 'guest' ? 'Save groups with email' : 'Email magic link'}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  stack: {
    gap: theme.spacing.lg,
  },
});
