/**
 * Cadence — Twilight Sanctuary color system
 * Nature-atmospheric, Genshin-inspired cozy night palette
 */

import { Platform } from 'react-native';

/* ─── Twilight palette ─── */
export const Twilight = {
  void: '#070e1a',
  deep: '#0a1628',
  base: '#0f1d32',
  surface: '#152540',
  elevated: '#1c2f50',

  text: '#e8edf5',
  textSoft: '#b0becc',
  textMuted: '#5c7080',

  border: 'rgba(255, 255, 255, 0.06)',
  borderLight: 'rgba(255, 255, 255, 0.10)',

  lantern: '#e8a44a',
  lanternSoft: 'rgba(232, 164, 74, 0.12)',
  lanternDim: 'rgba(232, 164, 74, 0.06)',
  moonlit: '#7eb8d4',
  moonlitSoft: 'rgba(126, 184, 212, 0.12)',

  glass: 'rgba(15, 29, 50, 0.45)',
  glassSurface: 'rgba(21, 37, 64, 0.5)',
};

/* ─── Daylight palette ─── */
export const Daylight = {
  base: '#f5f3f0',
  surface: '#eae6e1',
  text: '#1a1a2e',
  textMuted: '#6b7280',
  lantern: '#c4862e',
  border: 'rgba(0, 0, 0, 0.06)',
};

/* ─── Expo/RN compatible Colors map ─── */
export const Colors = {
  light: {
    text: Daylight.text,
    background: Daylight.base,
    tint: Daylight.lantern,
    icon: Daylight.textMuted,
    tabIconDefault: Daylight.textMuted,
    tabIconSelected: Daylight.lantern,
  },
  dark: {
    text: Twilight.text,
    background: Twilight.void,
    tint: Twilight.lantern,
    icon: Twilight.textMuted,
    tabIconDefault: Twilight.textMuted,
    tabIconSelected: Twilight.lantern,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
