/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  const baseTheme = useColorScheme() ?? 'light';
  const theme = baseTheme === 'unspecified' ? 'light' : baseTheme;
  const colorFromProps = props[theme as 'light' | 'dark'];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme as 'light' | 'dark'][colorName];
  }
}
