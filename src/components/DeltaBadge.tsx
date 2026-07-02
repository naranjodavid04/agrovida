import { StyleSheet, Text } from 'react-native';

import { strings } from '@/lib/i18n/strings';
import { deltaColors, fonts } from '@/lib/theme/tokens';

interface Props {
  /** Difference vs yesterday in liters; null when there is no comparison. */
  delta: number | null;
}

/** Yesterday comparison with sign and text (never color alone). */
export function DeltaBadge({ delta }: Props) {
  if (delta === null) {
    return (
      <Text style={[styles.text, { color: deltaColors.none }]}>
        {strings.milk.noComparison} · {strings.milk.vsYesterday}
      </Text>
    );
  }
  const rounded = Math.round(delta * 10) / 10;
  const color =
    rounded > 0 ? deltaColors.increase : rounded < 0 ? deltaColors.decrease : deltaColors.none;
  const sign = rounded > 0 ? '▲ +' : rounded < 0 ? '▼ ' : '= ';
  return (
    <Text style={[styles.text, { color }]}>
      {sign}
      {rounded} {strings.common.liters} · {strings.milk.vsYesterday}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily: fonts.bold,
    fontSize: 12,
  },
});
