import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing, touchTarget } from '@/lib/theme/tokens';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Segmented control (e.g. morning/afternoon) with field-sized targets. */
export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.track}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.borderSoft,
    borderRadius: radius.input + 2,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: touchTarget.min,
    borderRadius: radius.input,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  segmentSelected: {
    backgroundColor: colors.surface,
  },
  label: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.textMuted,
  },
  labelSelected: {
    color: colors.primary,
    fontFamily: fonts.bold,
  },
});
