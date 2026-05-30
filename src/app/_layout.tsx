// src/app/_layout.tsx
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';

import { AuthProvider, useAuth } from '../features/auth/AuthProvider';
import { trackAnalyticsEvent } from '../lib/analytics';

function AppAnalyticsTracker() {
  const { accountState, isLoading, user } = useAuth();
  const trackedAppOpenKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (isLoading || !user) {
      return;
    }

    const appOpenKey = `${user.id}:${accountState}`;

    if (trackedAppOpenKey.current === appOpenKey) {
      return;
    }

    trackedAppOpenKey.current = appOpenKey;
    trackAnalyticsEvent({
      name: 'app_opened',
      properties: {
        accountState,
      },
    });
  }, [accountState, isLoading, user]);

  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppAnalyticsTracker />
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerTitleAlign: 'center',
        }}
      />
    </AuthProvider>
  );
}
