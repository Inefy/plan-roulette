// src/components/EmptyState.tsx
import { StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';

import { theme } from '../constants/theme';
import { Text } from './Text';

type EmptyStateProps = {
  action?: ReactNode;
  icon?: ReactNode;
  message?: string;
  title: string;
};

export function EmptyState({ action, icon, message, title }: EmptyStateProps) {
  return (
    <View accessibilityRole="summary" style={styles.container}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text align="center" variant="subtitle">
        {title}
      </Text>
      {message ? (
        <Text align="center" color="textSecondary">
          {message}
        </Text>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    marginTop: theme.spacing.sm,
    minHeight: 48,
  },
  container: {
    alignItems: 'center',
    gap: theme.spacing.md,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  icon: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceWarm,
    borderRadius: theme.radius.pill,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
});
