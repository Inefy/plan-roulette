// src/components/Avatar.tsx
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { theme, type ThemeColor } from '../constants/theme';
import { getAvatarInitials, type AvatarTone } from '../utils/avatar';
import { Text } from './Text';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

type AvatarProps = {
  accessibilityLabel?: string;
  initials?: string;
  name?: string;
  size?: AvatarSize;
  source?: ImageSourcePropType;
  tone?: AvatarTone;
};

const sizes: Record<AvatarSize, number> = {
  lg: 56,
  md: 48,
  sm: 40,
  xl: 72,
};

const toneColors: Record<AvatarTone, ThemeColor> = {
  blue: 'poolBlue',
  green: 'goGreen',
  lavender: 'lavenderPop',
  navy: 'afterpartyNavy',
  orange: 'electricTangerine',
  red: 'rouletteRed',
  yellow: 'nachoYellow',
};

export function Avatar({
  accessibilityLabel,
  initials,
  name,
  size = 'md',
  source,
  tone = 'orange',
}: AvatarProps) {
  const dimension = sizes[size];
  const label = accessibilityLabel ?? (name ? `${name} avatar` : 'Avatar');

  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="image"
      style={[
        styles.base,
        {
          backgroundColor: theme.colors[toneColors[tone]],
          borderRadius: dimension / 2,
          height: dimension,
          width: dimension,
        },
      ]}
    >
      {source ? (
        <Image source={source} style={[styles.image, { borderRadius: dimension / 2 }]} />
      ) : (
        <Text color={tone === 'navy' ? 'textInverse' : 'afterpartyNavy'} variant="label">
          {getAvatarInitials(name, initials)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    height: '100%',
    width: '100%',
  },
});
