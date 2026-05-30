// src/components/Skeleton.tsx
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { theme } from '../constants/theme';

type SkeletonBlockProps = {
  height?: number;
  radius?: keyof typeof theme.radius;
  style?: StyleProp<ViewStyle>;
  width?: DimensionValue;
};

type SkeletonTextProps = {
  lines?: number;
  widths?: DimensionValue[];
};

export function SkeletonBlock({
  height = 16,
  radius = 'sm',
  style,
  width = '100%',
}: SkeletonBlockProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        styles.block,
        {
          borderRadius: theme.radius[radius],
          height,
          width,
        },
        style,
      ]}
    />
  );
}

export function SkeletonText({ lines = 3, widths = ['92%', '76%', '48%'] }: SkeletonTextProps) {
  return (
    <View accessibilityLabel="Loading content" accessibilityRole="progressbar" style={styles.textStack}>
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonBlock
          height={14}
          key={`skeleton-line-${index}`}
          radius="xs"
          width={widths[index % widths.length]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: theme.colors.muted,
  },
  textStack: {
    gap: theme.spacing.sm,
  },
});
