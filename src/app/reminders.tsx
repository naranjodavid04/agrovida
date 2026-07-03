import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLocalQuery } from '@/features/herd/useLocalQuery';
import { computeReminders, type Reminder, type ReminderKind } from '@/features/reminders/service';
import { todayIsoDate } from '@/lib/dates';
import { strings } from '@/lib/i18n/strings';
import { colors, fonts, radius, spacing, statusColors } from '@/lib/theme/tokens';

const KIND_ICON: Record<ReminderKind, keyof typeof Ionicons.glyphMap> = {
  withdrawal_active: 'warning',
  drying_off: 'water',
  calving_upcoming: 'heart',
  pregnancy_check_due: 'search',
};

function reminderText(reminder: Reminder): string {
  switch (reminder.kind) {
    case 'withdrawal_active':
      return `${strings.reminders.withdrawalActive} ${reminder.dueDate}`;
    case 'drying_off':
      return strings.reminders.dryingOffTitle;
    case 'calving_upcoming':
      return `${strings.reminders.calvingUpcoming}: ${reminder.dueDate}`;
    case 'pregnancy_check_due':
      return strings.reminders.pregnancyCheckDue;
  }
}

/** Derived reminders list (D-019): drying-off, calving, checks, withdrawals. */
export default function RemindersScreen() {
  const { activeFarmId } = useAuth();
  const router = useRouter();

  const query = useCallback(
    (driver: Parameters<typeof computeReminders>[0]) =>
      activeFarmId ? computeReminders(driver, activeFarmId, todayIsoDate()) : [],
    [activeFarmId],
  );
  const { data } = useLocalQuery(query);
  const reminders = data ?? [];

  return (
    <ScreenContainer>
      <ScreenHeader title={strings.reminders.title} />
      <OfflineBanner />
      <FlatList
        data={reminders}
        keyExtractor={(item) => `${item.kind}-${item.cowId}`}
        contentContainerStyle={styles.content}
        ListEmptyComponent={<EmptyState title={strings.reminders.none} />}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.cowName}: ${reminderText(item)}`}
            onPress={() => router.push({ pathname: '/cow/[id]', params: { id: item.cowId } })}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View
              style={[
                styles.iconBox,
                item.kind === 'withdrawal_active' ? styles.iconBoxWarning : null,
              ]}
            >
              <Ionicons
                name={KIND_ICON[item.kind]}
                size={18}
                color={
                  item.kind === 'withdrawal_active' ? statusColors.pregnant.fg : colors.primary
                }
              />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{item.cowName}</Text>
              <Text style={styles.rowText}>{reminderText(item)}</Text>
            </View>
            <Text style={styles.rowDate}>{item.dueDate}</Text>
          </Pressable>
        )}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.listRow,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  pressed: {
    opacity: 0.85,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.input,
    backgroundColor: statusColors.lactating.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxWarning: {
    backgroundColor: statusColors.pregnant.bg,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  rowText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  rowDate: {
    fontFamily: fonts.numericSemiBold,
    fontSize: 13,
    color: colors.textMuted,
  },
});
