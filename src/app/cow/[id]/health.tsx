import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { ChoicePills } from '@/components/ChoicePills';
import { EmptyState } from '@/components/EmptyState';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { getDatabase } from '@/db/database';
import { useAuth } from '@/features/auth/AuthProvider';
import { domainErrorMessage } from '@/features/herd/errorMessages';
import { useLocalQuery } from '@/features/herd/useLocalQuery';
import { useSync } from '@/features/sync/SyncProvider';
import { toIsoDate, todayIsoDate } from '@/lib/dates';
import { strings } from '@/lib/i18n/strings';
import { getCow } from '@/repositories/cows';
import { activeWithdrawalUntil, createHealthEvent, listHealthEvents } from '@/repositories/events';
import { colors, fonts, radius, spacing, statusColors, touchTarget } from '@/lib/theme/tokens';
import type { HealthEventType } from '@/types/domain';

const TYPE_LABELS: Record<HealthEventType, string> = {
  treatment: strings.health.treatment,
  vaccination: strings.health.vaccination,
  illness: strings.health.illness,
  checkup: strings.health.checkup,
  other: strings.health.other,
};

/** Health events per cow: list + add, with milk-withdrawal tracking (D-019). */
export default function HealthScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeFarmId, user } = useAuth();
  const { notifyLocalChange } = useSync();
  const cow = getCow(getDatabase(), id);

  const [eventDate, setEventDate] = useState(todayIsoDate());
  const [eventType, setEventType] = useState<HealthEventType>('treatment');
  const [description, setDescription] = useState('');
  const [withdrawal, setWithdrawal] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState<'event' | 'withdrawal' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useCallback(
    (driver: Parameters<typeof listHealthEvents>[0]) => ({
      events: listHealthEvents(driver, id),
      withdrawalUntil: activeWithdrawalUntil(driver, id, todayIsoDate()),
    }),
    [id],
  );
  const { data, reload } = useLocalQuery(query);

  const save = () => {
    if (!activeFarmId || !user) return;
    setError(null);
    try {
      createHealthEvent(
        getDatabase(),
        {
          farmId: activeFarmId,
          cowId: id,
          eventDate,
          eventType,
          description,
          withdrawalUntil: eventType === 'treatment' ? withdrawal : null,
        },
        user.id,
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDescription('');
      setWithdrawal(null);
      reload();
      notifyLocalChange();
    } catch (err) {
      setError(domainErrorMessage(err));
    }
  };

  return (
    <ScreenContainer>
      <ScreenHeader title={`${strings.health.title} · ${cow?.name ?? ''}`} />
      <OfflineBanner />
      <FlatList
        data={data?.events ?? []}
        keyExtractor={(event) => event.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            {data?.withdrawalUntil ? (
              <View style={styles.withdrawalBanner} accessibilityRole="alert">
                <Text style={styles.withdrawalText}>
                  ⚠ {strings.health.withdrawalActive}: {data.withdrawalUntil}
                </Text>
              </View>
            ) : null}

            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>{strings.health.addEvent}</Text>
              <Text style={styles.fieldLabel}>{strings.milk.date}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={strings.milk.date}
                onPress={() => setShowDatePicker('event')}
                style={styles.dateButton}
              >
                <Text style={styles.dateValue}>{eventDate}</Text>
              </Pressable>

              <Text style={styles.fieldLabel}>{strings.health.eventType}</Text>
              <ChoicePills<HealthEventType>
                options={(Object.keys(TYPE_LABELS) as HealthEventType[]).map((value) => ({
                  value,
                  label: TYPE_LABELS[value],
                }))}
                value={eventType}
                onChange={setEventType}
              />

              <TextField
                label={strings.health.description}
                value={description}
                onChangeText={setDescription}
                multiline
              />

              {eventType === 'treatment' ? (
                <>
                  <Text style={styles.fieldLabel}>{strings.health.withdrawalOptional}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={strings.health.withdrawalOptional}
                    onPress={() => setShowDatePicker('withdrawal')}
                    style={styles.dateButton}
                  >
                    <Text style={withdrawal ? styles.dateValue : styles.datePlaceholder}>
                      {withdrawal ?? strings.health.withdrawalNone}
                    </Text>
                  </Pressable>
                </>
              ) : null}

              {showDatePicker ? (
                <DateTimePicker
                  value={
                    new Date(
                      `${showDatePicker === 'event' ? eventDate : (withdrawal ?? eventDate)}T12:00:00`,
                    )
                  }
                  mode="date"
                  maximumDate={showDatePicker === 'event' ? new Date() : undefined}
                  onChange={(pickerEvent, picked) => {
                    const target = showDatePicker;
                    setShowDatePicker(null);
                    if (pickerEvent.type === 'set' && picked && target) {
                      if (target === 'event') setEventDate(toIsoDate(picked));
                      else setWithdrawal(toIsoDate(picked));
                    }
                  }}
                />
              ) : null}

              {error ? (
                <Text style={styles.error} accessibilityRole="alert">
                  {error}
                </Text>
              ) : null}
              <AppButton
                title={strings.common.save}
                onPress={save}
                disabled={description.trim() === ''}
                style={styles.saveButton}
              />
            </View>
            {(data?.events ?? []).length === 0 ? (
              <EmptyState title={strings.health.noEvents} />
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>
                {TYPE_LABELS[item.eventType]} · {item.eventDate}
              </Text>
              <Text style={styles.rowDescription}>{item.description}</Text>
              {item.withdrawalUntil ? (
                <Text style={styles.rowWithdrawal}>
                  {strings.health.withdrawalActive}: {item.withdrawalUntil}
                </Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  withdrawalBanner: {
    backgroundColor: statusColors.pregnant.bg,
    borderRadius: radius.input,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  withdrawalText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: statusColors.pregnant.fg,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.detailPanel,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  dateButton: {
    minHeight: touchTarget.field,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.borderInput,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  dateValue: {
    fontFamily: fonts.numericSemiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  datePlaceholder: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.textSecondary,
  },
  error: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  saveButton: {
    marginTop: spacing.md,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.listRow,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowBody: {
    gap: 2,
  },
  rowTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  rowDescription: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textMuted,
  },
  rowWithdrawal: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: statusColors.pregnant.fg,
  },
});
