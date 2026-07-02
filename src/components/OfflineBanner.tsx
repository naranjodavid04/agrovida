import { StyleSheet, Text, View } from 'react-native';

import { strings } from '@/lib/i18n/strings';
import { colors, fonts, radius, spacing } from '@/lib/theme/tokens';
import { useIsOnline } from '@/lib/useIsOnline';

/**
 * Compact offline notice (UX principle: sync state visible but unobtrusive;
 * status is never communicated by color alone).
 */
export function OfflineBanner() {
  const isOnline = useIsOnline();
  if (isOnline !== false) return null;
  return (
    <View style={styles.banner} accessibilityRole="text">
      <Text style={styles.text}>
        {strings.sync.offline} · {strings.sync.dataSafeLocally}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.borderSoft,
    borderWidth: 1,
    borderRadius: radius.input,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  text: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
