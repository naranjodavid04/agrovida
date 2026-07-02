import { StyleSheet, Text, View } from 'react-native';

import { strings } from '@/lib/i18n/strings';
import { fonts, radius, spacing, statusColors } from '@/lib/theme/tokens';
import type { Cow } from '@/types/domain';

/**
 * Independent status dimensions as compact chips (D-005, DESIGN_SPEC §6).
 * An inactive lifecycle replaces both chips. Status is written out, never
 * color alone.
 */

interface ChipProps {
  label: string;
  fg: string;
  bg: string;
}

function Chip({ label, fg, bg }: ChipProps) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
    </View>
  );
}

const LIFECYCLE_LABELS: Record<Cow['lifecycleStatus'], string> = {
  active: strings.status.active,
  sold: strings.status.sold,
  deceased: strings.status.deceased,
  culled: strings.status.culled,
};

interface Props {
  cow: Pick<Cow, 'lifecycleStatus' | 'lactationStatus' | 'pregnancyStatus'>;
  /** Show open/unknown states too (detail screens). */
  verbose?: boolean;
}

export function StatusChips({ cow, verbose = false }: Props) {
  if (cow.lifecycleStatus !== 'active') {
    const palette = statusColors.inactiveLifecycle;
    return (
      <View style={styles.row} accessibilityLabel={LIFECYCLE_LABELS[cow.lifecycleStatus]}>
        <Chip label={LIFECYCLE_LABELS[cow.lifecycleStatus]} fg={palette.fg} bg={palette.bg} />
      </View>
    );
  }

  const chips: ChipProps[] = [];
  if (cow.lactationStatus === 'lactating') {
    chips.push({ label: strings.status.lactating, ...statusColors.lactating });
  } else if (cow.lactationStatus === 'dry') {
    chips.push({ label: strings.status.dry, ...statusColors.dry });
  } else if (verbose) {
    chips.push({ label: strings.status.lactationUnknown, ...statusColors.openOrUnknown });
  }
  if (cow.pregnancyStatus === 'pregnant') {
    chips.push({ label: strings.status.pregnant, ...statusColors.pregnant });
  } else if (verbose) {
    chips.push({
      label: cow.pregnancyStatus === 'open' ? strings.status.open : strings.status.pregnancyUnknown,
      ...statusColors.openOrUnknown,
    });
  }
  if (chips.length === 0) return null;
  return (
    <View style={styles.row} accessibilityLabel={chips.map((c) => c.label).join(', ')}>
      {chips.map((chip) => (
        <Chip key={chip.label} {...chip} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipText: {
    fontFamily: fonts.bold,
    fontSize: 12,
  },
});
