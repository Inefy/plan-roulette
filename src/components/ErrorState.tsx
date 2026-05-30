// src/components/ErrorState.tsx
import { StyleSheet, View } from 'react-native';

import { theme } from '../constants/theme';
import { Button } from './Button';
import { Text } from './Text';

type ErrorStateProps = {
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  title?: string;
};

export function ErrorState({
  message = 'Something went wrong. Try again in a moment.',
  onRetry,
  retryLabel = 'Try again',
  title = 'Unable to load',
}: ErrorStateProps) {
  return (
    <View accessibilityRole="alert" style={styles.container}>
      <View style={styles.mark}>
        <Text color="textInverse" variant="title">
          !
        </Text>
      </View>
      <Text align="center" variant="subtitle">
        {title}
      </Text>
      <Text align="center" color="textSecondary">
        {message}
      </Text>
      {onRetry ? <Button onPress={onRetry} title={retryLabel} variant="outline" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: theme.spacing.md,
    justifyContent: 'center',
    minHeight: 200,
    padding: theme.spacing.xl,
  },
  mark: {
    alignItems: 'center',
    backgroundColor: theme.colors.nopeCoral,
    borderRadius: theme.radius.pill,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
});
