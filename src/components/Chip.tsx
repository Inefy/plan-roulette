// src/components/Chip.tsx
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { theme, type ThemeColor } from '../constants/theme';
import { Text } from './Text';

export type ChipTone = 'neutral' | 'red' | 'orange' | 'green' | 'blue' | 'lavender' | 'yellow';

type ChipProps = {
  accessibilityLabel?: string;
  disabled?: boolean;
  leading?: ReactNode;
  onPress?: () => void;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  title: string;
  tone?: ChipTone;
};

type ChipColorSet = {
  background: ThemeColor;
  border: ThemeColor;
  label: ThemeColor;
};

const toneColors: Record<ChipTone, ChipColorSet> = {
  blue: {
    background: 'poolBlue',
    border: 'poolBlue',
    label: 'afterpartyNavy',
  },
  green: {
    background: 'goGreen',
    border: 'goGreen',
    label: 'afterpartyNavy',
  },
  lavender: {
    background: 'lavenderPop',
    border: 'lavenderPop',
    label: 'afterpartyNavy',
  },
  neutral: {
    background: 'surfaceSubtle',
    border: 'border',
    label: 'textPrimary',
  },
  orange: {
    background: 'electricTangerine',
    border: 'electricTangerine',
    label: 'afterpartyNavy',
  },
  red: {
    background: 'rouletteRed',
    border: 'rouletteRed',
    label: 'afterpartyNavy',
  },
  yellow: {
    background: 'nachoYellow',
    border: 'nachoYellow',
    label: 'afterpartyNavy',
  },
};

export function Chip({
  accessibilityLabel,
  disabled = false,
  leading,
  onPress,
  selected = false,
  style,
  testID,
  title,
  tone = 'neutral',
}: ChipProps) {
  const colors = toneColors[tone];
  const content = (
    <>
      {leading}
      <Text color={selected ? 'textInverse' : colors.label} variant="caption">
        {title}
      </Text>
    </>
  );
  const chipStyle = [
    styles.base,
    {
      backgroundColor: selected ? theme.colors.afterpartyNavy : theme.colors[colors.background],
      borderColor: selected ? theme.colors.afterpartyNavy : theme.colors[colors.border],
    },
    disabled && styles.disabled,
    style,
  ];

  if (!onPress) {
    return (
      <View accessibilityLabel={accessibilityLabel ?? title} style={chipStyle} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      accessibilityState={{
        disabled,
        selected,
      }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [chipStyle, pressed && !disabled && styles.pressed]}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    minHeight: 36,
    minWidth: 36,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
});
