// src/components/Screen.tsx
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';

import { theme, type ThemeColor } from '../constants/theme';

type ScreenProps = {
  backgroundColor?: ThemeColor;
  centered?: boolean;
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  edges?: Edge[];
  padded?: boolean;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Screen({
  backgroundColor = 'background',
  centered = false,
  children,
  contentContainerStyle,
  edges = ['top', 'right', 'bottom', 'left'],
  padded = true,
  scroll = false,
  style,
}: ScreenProps) {
  const backgroundStyle = { backgroundColor: theme.colors[backgroundColor] };
  const contentStyle = [styles.content, padded && styles.padded, centered && styles.centered, contentContainerStyle];

  return (
    <SafeAreaView edges={edges} style={[styles.safeArea, backgroundStyle, style]}>
      {scroll ? (
        <ScrollView contentContainerStyle={contentStyle} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={contentStyle}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
  },
  padded: {
    padding: theme.spacing.xl,
  },
  safeArea: {
    flex: 1,
  },
});
