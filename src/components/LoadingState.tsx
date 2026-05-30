// src/components/LoadingState.tsx
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { theme } from '../constants/theme';
import { Text } from './Text';

type LoadingStateProps = {
  message?: string;
};

export function LoadingState({ message = 'Loading...' }: LoadingStateProps) {
  return (
    <View accessibilityLabel={message} accessibilityRole="progressbar" style={styles.container}>
      <ActivityIndicator color={theme.colors.rouletteRed} size="large" />
      <Text align="center" color="textSecondary" variant="label">
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: theme.spacing.md,
    justifyContent: 'center',
    minHeight: 160,
    padding: theme.spacing.xl,
  },
});
