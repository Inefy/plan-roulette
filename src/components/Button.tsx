// src/components/Button.tsx
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { theme, type ThemeColor } from '../constants/theme';
import { Text } from './Text';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'md' | 'lg';

type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  fullWidth?: boolean;
  leftAccessory?: ReactNode;
  loading?: boolean;
  rightAccessory?: ReactNode;
  size?: ButtonSize;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  title: string;
  variant?: ButtonVariant;
};

type ButtonColorSet = {
  background: ThemeColor;
  border: ThemeColor;
  label: ThemeColor;
  spinner: string;
};

const variantColors: Record<ButtonVariant, ButtonColorSet> = {
  danger: {
    background: 'nopeCoral',
    border: 'nopeCoral',
    label: 'afterpartyNavy',
    spinner: theme.colors.afterpartyNavy,
  },
  ghost: {
    background: 'surface',
    border: 'surface',
    label: 'afterpartyNavy',
    spinner: theme.colors.afterpartyNavy,
  },
  outline: {
    background: 'surface',
    border: 'afterpartyNavy',
    label: 'afterpartyNavy',
    spinner: theme.colors.afterpartyNavy,
  },
  primary: {
    background: 'rouletteRed',
    border: 'rouletteRed',
    label: 'afterpartyNavy',
    spinner: theme.colors.afterpartyNavy,
  },
  secondary: {
    background: 'electricTangerine',
    border: 'electricTangerine',
    label: 'afterpartyNavy',
    spinner: theme.colors.afterpartyNavy,
  },
  success: {
    background: 'goGreen',
    border: 'goGreen',
    label: 'afterpartyNavy',
    spinner: theme.colors.afterpartyNavy,
  },
};

export function Button({
  accessibilityLabel,
  accessibilityState,
  disabled,
  fullWidth = false,
  leftAccessory,
  loading = false,
  rightAccessory,
  size = 'md',
  style,
  textStyle,
  title,
  variant = 'primary',
  ...props
}: ButtonProps) {
  const colors = variantColors[variant];
  const isDisabled = Boolean(disabled || loading);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      accessibilityState={{
        busy: loading,
        disabled: isDisabled,
        ...accessibilityState,
      }}
      disabled={isDisabled}
      hitSlop={8}
      {...props}
      style={({ pressed }) => [
        styles.base,
        styles[size],
        {
          backgroundColor: theme.colors[colors.background],
          borderColor: theme.colors[colors.border],
        },
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator color={colors.spinner} size="small" /> : leftAccessory}
        <Text color={colors.label} style={textStyle} variant="label">
          {title}
        </Text>
        {!loading ? rightAccessory : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    justifyContent: 'center',
    minWidth: 48,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  fullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  lg: {
    minHeight: 56,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
  },
  md: {
    minHeight: 48,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
});
