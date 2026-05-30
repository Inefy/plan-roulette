// src/components/ProgressBar.tsx
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { theme, type ThemeColor } from '../constants/theme';

type ProgressBarProps = {
  accessibilityLabel?: string;
  color?: ThemeColor;
  max?: number;
  style?: StyleProp<ViewStyle>;
  value: number;
};

function clampProgress(value: number, max: number) {
  if (max <= 0) {
    return 0;
  }

  return Math.min(Math.max(value / max, 0), 1);
}

export function ProgressBar({
  accessibilityLabel = 'Progress',
  color = 'rouletteRed',
  max = 1,
  style,
  value,
}: ProgressBarProps) {
  const progress = clampProgress(value, max);

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityValue={{ max, min: 0, now: value }}
      style={[styles.track, style]}
    >
      <View style={[styles.fill, { backgroundColor: theme.colors[color], width: `${progress * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    borderRadius: theme.radius.pill,
    height: '100%',
  },
  track: {
    backgroundColor: theme.colors.muted,
    borderRadius: theme.radius.pill,
    height: 12,
    overflow: 'hidden',
    width: '100%',
  },
});
