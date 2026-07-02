import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { strings } from '@/lib/i18n/strings';
import { colors } from '@/lib/theme/tokens';

interface Props {
  /** Seven daily totals, oldest first. */
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
}

/** Seven-day production sparkline (values are derived, never stored — D-007). */
export function Sparkline({ values, width = 72, height = 30, stroke = colors.primary }: Props) {
  const max = Math.max(...values, 1);
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const points = values
    .map((value, index) => {
      const x = index * stepX;
      const y = height - (value / max) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = values.at(-1) ?? 0;
  const lastX = (values.length - 1) * stepX;
  const lastY = height - (last / max) * (height - 4) - 2;

  return (
    <View accessibilityRole="image" accessibilityLabel={strings.a11y.sparkline}>
      <Svg width={width} height={height}>
        <Polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx={lastX} cy={lastY} r={2.5} fill={stroke} />
      </Svg>
    </View>
  );
}
