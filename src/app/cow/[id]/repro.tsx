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
import { SegmentedControl } from '@/components/SegmentedControl';
import { TextField } from '@/components/TextField';
import { getDatabase } from '@/db/database';
import { useAuth } from '@/features/auth/AuthProvider';
import { domainErrorMessage } from '@/features/herd/errorMessages';
import { useLocalQuery } from '@/features/herd/useLocalQuery';
import { useSync } from '@/features/sync/SyncProvider';
import { toIsoDate, todayIsoDate } from '@/lib/dates';
import { strings } from '@/lib/i18n/strings';
import { getCow } from '@/repositories/cows';
import { createReproEvent, expectedCalvingDate, listReproEvents } from '@/repositories/events';
import { colors, fonts, radius, spacing, statusColors, touchTarget } from '@/lib/theme/tokens';
import type { PregnancyCheckResult, ReproEventType } from '@/types/domain';

const TYPE_LABELS: Record<ReproEventType, string> = {
  heat: strings.repro.heat,
  insemination: strings.repro.insemination,
  pregnancy_check: strings.repro.pregnancyCheck,
  calving: strings.repro.calving,
  abortion: strings.repro.abortion,
};

/**
 * Reproduction events per cow: list + add; expected calving date is derived
 * from the last open insemination + 283 days (never stored, D-019).
 */
export default function ReproScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeFarmId, user } = useAuth();
  const { notifyLocalChange } = useSync();
  const cow = getCow(getDatabase(), id);

  const [eventDate, setEventDate] = useState(todayIsoDate());
  const [eventType, setEventType] = useState<ReproEventType>('heat');
  const [result, setResult] = useState<PregnancyCheckResult>('pregnant');
  const [notes, setNotes] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useCallback(
    (driver: Parameters<typeof listReproEvents>[0]) => ({
      events: listReproEvents(driver, id),
      expectedCalving: expectedCalvingDate(driver, id),
    }),
    [id],
  );
  const { data, reload } = useLocalQuery(query);

  const save = () => {
    if (!activeFarmId || !user) return;
    setError(null);
    try {
      createReproEvent(
        getDatabase(),
        {
          farmId: activeFarmId,
          cowId: id,
          eventDate,
          eventType,
          result: eventType === 'pregnancy_check' ? result : null,
          notes: notes.trim() === '' ? null : notes,
        },
        user.id,
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNotes('');
      reload();
      notifyLocalChange();
    } catch (err) {
      setError(domainErrorMessage(err));
    }
  };

  return (
    <ScreenContainer>
      <ScreenHeader title={`${strings.repro.title} · ${cow?.name ?? ''}`} />
      <OfflineBanner />
      <FlatList
        data={data?.events ?? []}
        keyExtractor={(event) => event.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            {data?.expectedCalving ? (
              <View style={styles.calvingBanner} accessibilityRole="text">
                <Text style={styles.calvingText}>
                  🐄 {strings.repro.expectedCalving}: {data.expectedCalving}
                </Text>
              </View>
            ) : null}

            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>{strings.repro.addEvent}</Text>
              <Text style={styles.fieldLabel}>{strings.milk.date}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={strings.milk.date}
                onPress={() => setShowDatePicker(true)}
                style={styles.dateButton}
              >
                <Text style={styles.dateValue}>{eventDate}</Text>
              </Pressable>
              {showDatePicker ? (
                <DateTimePicker
                  value={new Date(`${eventDate}T12:00:00`)}
                  mode="date"
                  maximumDate={new Date()}
                  onChange={(pickerEvent, picked) => {
                    setShowDatePicker(false);
                    if (pickerEvent.type === 'set' && picked) setEventDate(toIsoDate(picked));
                  }}
                />
              ) : null}

              <Text style={styles.fieldLabel}>{strings.health.eventType}</Text>
              <ChoicePills<ReproEventType>
                options={(Object.keys(TYPE_LABELS) as ReproEventType[]).map((value) => ({
                  value,
                  label: TYPE_LABELS[value],
                }))}
                value={eventType}
                onChange={setEventType}
              />

              {eventType === 'pregnancy_check' ? (
                <>
                  <Text style={styles.fieldLabel}>{strings.repro.result}</Text>
                  <SegmentedControl<PregnancyCheckResult>
                    options={[
                      { value: 'pregnant', label: strings.status.pregnant },
                      { value: 'open', label: strings.status.open },
                    ]}
                    value={result}
                    onChange={setResult}
                  />
                </>
              ) : null}

              <TextField
                label={strings.repro.notesOptional}
                value={notes}
                onChangeText={setNotes}
              />

              {error ? (
                <Text style={styles.error} accessibilityRole="alert">
                  {error}
                </Text>
              ) : null}
              <AppButton title={strings.common.save} onPress={save} style={styles.saveButton} />
            </View>
            {(data?.events ?? []).length === 0 ? (
              <EmptyState title={strings.repro.noEvents} />
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowTitle}>
              {TYPE_LABELS[item.eventType]} · {item.eventDate}
              {item.result
                ? ` · ${item.result === 'pregnant' ? strings.status.pregnant : strings.status.open}`
                : ''}
            </Text>
            {item.notes ? <Text style={styles.rowNotes}>{item.notes}</Text> : null}
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
  calvingBanner: {
    backgroundColor: statusColors.lactating.bg,
    borderRadius: radius.input,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  calvingText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: statusColors.lactating.fg,
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
  rowTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  rowNotes: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
});
