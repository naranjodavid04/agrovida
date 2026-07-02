import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useSync } from '@/features/sync/SyncProvider';
import { strings } from '@/lib/i18n/strings';
import { colors, fonts, radius, spacing, statusColors } from '@/lib/theme/tokens';
import { useIsOnline } from '@/lib/useIsOnline';

/**
 * Compact, unobtrusive sync state (PRODUCT_SPEC §3): offline, syncing,
 * synchronized, or action required. Tapping opens diagnostics (screen 15).
 */
export function SyncBadge() {
  const { snapshot } = useSync();
  const isOnline = useIsOnline();
  const router = useRouter();

  let label: string;
  let fg: string = colors.textMuted;
  let bg: string = colors.surfaceSoft;
  if (isOnline === false) {
    label = strings.sync.offline;
  } else if (snapshot.status === 'syncing') {
    label = strings.sync.syncing;
  } else if (snapshot.status === 'action_required') {
    label = strings.sync.actionRequired;
    fg = statusColors.pregnant.fg;
    bg = statusColors.pregnant.bg;
  } else if (snapshot.status === 'error') {
    label = strings.sync.actionRequired;
    fg = colors.danger;
    bg = colors.dangerBg;
  } else if (snapshot.pendingCount > 0) {
    label = `${strings.sync.pendingChanges}: ${snapshot.pendingCount}`;
  } else {
    label = strings.sync.synced;
    fg = statusColors.lactating.fg;
    bg = statusColors.lactating.bg;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${strings.a11y.syncIndicator}: ${label}`}
      onPress={() => router.push('/sync-status')}
      style={({ pressed }) => [styles.badge, { backgroundColor: bg }, pressed && styles.pressed]}
    >
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  pressed: {
    opacity: 0.8,
  },
  text: {
    fontFamily: fonts.bold,
    fontSize: 12,
  },
});
