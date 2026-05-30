// src/components/Card.tsx
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { theme } from '../constants/theme';

type CardVariant = 'default' | 'elevated' | 'outlined' | 'warm';

type CardProps = {
  accessibilityHint?: string;
  accessibilityLabel?: string;
  children: ReactNode;
  disabled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  variant?: CardVariant;
};

export function Card({
  accessibilityHint,
  accessibilityLabel,
  children,
  disabled = false,
  onPress,
  style,
  testID,
  variant = 'default',
}: CardProps) {
  const cardStyle = [styles.base, styles[variant], disabled && styles.disabled, style];

  if (!onPress) {
    return (
      <View style={cardStyle} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [cardStyle, pressed && !disabled && styles.pressed]}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    gap: theme.spacing.lg,
    padding: theme.spacing.xl,
  },
  default: {},
  disabled: {
    opacity: 0.55,
  },
  elevated: {
    ...theme.shadow.card,
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: 'rgba(31, 35, 48, 0.08)',
  },
  outlined: {
    backgroundColor: 'transparent',
    borderColor: theme.colors.afterpartyNavy,
    borderWidth: 2,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  warm: {
    backgroundColor: theme.colors.surfaceWarm,
    borderColor: 'rgba(243, 154, 33, 0.24)',
  },
});
