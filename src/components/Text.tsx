// src/components/Text.tsx
import { Text as NativeText, StyleSheet, type TextProps as NativeTextProps, type TextStyle } from 'react-native';

import { theme, type TextVariant, type ThemeColor } from '../constants/theme';

type AppTextProps = NativeTextProps & {
  align?: TextStyle['textAlign'];
  color?: ThemeColor;
  variant?: TextVariant;
};

export function Text({
  align,
  color = 'textPrimary',
  style,
  variant = 'body',
  ...props
}: AppTextProps) {
  return (
    <NativeText
      allowFontScaling
      maxFontSizeMultiplier={1.35}
      {...props}
      style={[
        styles.base,
        styles[variant],
        {
          color: theme.colors[color],
          textAlign: align,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    letterSpacing: 0,
  },
  body: theme.typography.body,
  bodyStrong: theme.typography.bodyStrong,
  caption: theme.typography.caption,
  display: theme.typography.display,
  label: theme.typography.label,
  subtitle: theme.typography.subtitle,
  title: theme.typography.title,
});
