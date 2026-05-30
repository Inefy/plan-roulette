// src/constants/theme.ts
export const palette = {
  afterpartyNavy: '#171B2A',
  warmPaper: '#F8F2E7',
  rouletteRed: '#E94E3F',
  electricTangerine: '#F39A21',
  goGreen: '#1F9D66',
  nopeCoral: '#E85D66',
  poolBlue: '#2188D9',
  lavenderPop: '#8667D3',
  inkBlack: '#1C2230',
  sidewalkGray: '#737887',
  nachoYellow: '#F5C84C',
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
    surfaceRaised: '#FFFCF6',
    surfaceSubtle: '#F1E8DA',
    surfaceWarm: '#FDECC7',
    textPrimary: palette.inkBlack,
    textSecondary: '#596070',
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
      boxShadow: '0px 10px 28px rgba(21, 25, 38, 0.1)',
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
