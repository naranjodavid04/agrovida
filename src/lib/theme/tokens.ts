/**
 * Design tokens from docs/DESIGN_SPEC.md. Single source of truth for the UI —
 * screens must not hardcode colors, radii, spacing, or font names.
 */

export const colors = {
  primary: '#16794F',
  textPrimary: '#16211C',
  textSecondary: '#8A938C',
  textMuted: '#6B756E',
  appBackground: '#F4F7F4',
  surface: '#FFFFFF',
  surfaceSoft: '#F7FAF8',
  borderSoft: '#EEF2EF',
  borderInput: '#DDE4DF',
  onPrimary: '#FFFFFF',
  danger: '#B3261E',
  dangerBg: '#F9DEDC',
} as const;

export const statusColors = {
  lactating: { fg: '#1F7A4F', bg: '#E4F2EA' },
  pregnant: { fg: '#9A6A12', bg: '#F6ECD6' },
  openOrUnknown: { fg: '#55606A', bg: '#E9EDF0' },
  dry: { fg: '#7A5A5A', bg: '#F0E7E5' },
  inactiveLifecycle: { fg: '#5A5A5A', bg: '#E6E6E6' },
} as const;

export const deltaColors = {
  increase: '#1F7A4F',
  decrease: '#B5852F',
  none: '#8A9098',
} as const;

export const fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semiBold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extraBold: 'Manrope_800ExtraBold',
  numericMedium: 'SpaceGrotesk_500Medium',
  numericSemiBold: 'SpaceGrotesk_600SemiBold',
  numericBold: 'SpaceGrotesk_700Bold',
} as const;

export const radius = {
  mainCard: 24,
  detailPanel: 18,
  listRow: 16,
  input: 12,
  card: 14,
  pill: 999,
} as const;

/** 4pt spacing grid. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

/** Minimum touch target 44dp; prefer 48dp in field workflows. */
export const touchTarget = {
  min: 44,
  field: 48,
} as const;
