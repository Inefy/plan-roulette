// src/constants/theme.ts
export const palette = {
  afterpartyNavy: '#151926',
  warmPaper: '#FFF8EA',
  rouletteRed: '#F15A4A',
  electricTangerine: '#FF9F1C',
  goGreen: '#2EC27E',
  nopeCoral: '#FF6B6B',
  poolBlue: '#35A7FF',
  lavenderPop: '#9B7EDE',
  inkBlack: '#1F2330',
  sidewalkGray: '#7C8191',
  nachoYellow: '#FFD166',
} as const;

export const theme = {
  colors: {
    ...palette,
    background: palette.warmPaper,
    border: 'rgba(31, 35, 48, 0.14)',
    disabled: 'rgba(124, 129, 145, 0.38)',
    focusRing: 'rgba(53, 167, 255, 0.34)',
    muted: 'rgba(124, 129, 145, 0.16)',
    overlay: 'rgba(21, 25, 38, 0.2)',
    surface: '#FFFFFF',
    surfaceWarm: '#FFF1D0',
    textPrimary: palette.inkBlack,
    textSecondary: '#5F6472',
    textInverse: palette.warmPaper,
  },
  radius: {
    xs: 6,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    pill: 999,
  },
  shadow: {
    card: {
      boxShadow: '0px 6px 12px rgba(21, 25, 38, 0.12)',
      elevation: 3,
    },
  },
  spacing: {
    none: 0,
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    xxxl: 40,
  },
  typography: {
    display: {
      fontSize: 34,
      fontWeight: '800',
      lineHeight: 40,
    },
    title: {
      fontSize: 24,
      fontWeight: '800',
      lineHeight: 30,
    },
    subtitle: {
      fontSize: 20,
      fontWeight: '700',
      lineHeight: 26,
    },
    body: {
      fontSize: 16,
      fontWeight: '400',
      lineHeight: 24,
    },
    bodyStrong: {
      fontSize: 16,
      fontWeight: '700',
      lineHeight: 24,
    },
    label: {
      fontSize: 14,
      fontWeight: '700',
      lineHeight: 18,
    },
    caption: {
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 16,
    },
  },
} as const;

export type PaletteColor = keyof typeof palette;
export type ThemeColor = keyof typeof theme.colors;
export type TextVariant = keyof typeof theme.typography;
