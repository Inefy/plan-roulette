// src/app/auth/sign-in.tsx
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ErrorState, LoadingState, Screen, Text } from '../../components';
import { AuthActionPanel } from '../../features/auth/AuthActionPanel';
import { useAuth } from '../../features/auth/AuthProvider';

type SignInRouteParams = {
  mode?: string | string[];
  redirectTo?: string | string[];
};

function getParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function SignInRoute() {
  const params = useLocalSearchParams<SignInRouteParams>();
  const { accountState, errorMessage, isLoading } = useAuth();
  const mode = getParamValue(params.mode);
  const redirectTo = getParamValue(params.redirectTo);
  const isUpgrade = mode === 'upgrade';

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
        <View>
          <Text variant="title">{isUpgrade ? 'Save your groups for next time' : 'Sign In'}</Text>
          <Text color="textSecondary">
            {isUpgrade
              ? 'Send a magic link to attach an email to this guest account. Your current room identity stays in place when the upgrade can preserve this session.'
              : 'Continue as a guest or send a magic link for a permanent account.'}
          </Text>
        </View>
        {errorMessage ? <ErrorState message={errorMessage} title="Sign-in failed" /> : null}
        <AuthActionPanel
          description={
            isUpgrade
              ? 'Use the same browser or app after opening the magic link so Plan Roulette can keep your guest participant connected.'
              : undefined
          }
          redirectTo={redirectTo}
          showGuestAction={!isUpgrade}
          submitLabel={isUpgrade ? 'Send upgrade link' : 'Send magic link'}
          title={isUpgrade ? 'Email magic link' : undefined}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
  },
});
