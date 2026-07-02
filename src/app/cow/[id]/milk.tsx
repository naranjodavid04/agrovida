import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TextField } from '@/components/TextField';
import { getDatabase } from '@/db/database';
import { useAuth } from '@/features/auth/AuthProvider';
import { domainErrorMessage } from '@/features/herd/errorMessages';
import { useLocalQuery } from '@/features/herd/useLocalQuery';
import { toIsoDate, todayIsoDate } from '@/lib/dates';
import { strings } from '@/lib/i18n/strings';
import { getCow } from '@/repositories/cows';
import { getMilkRecord, upsertMilkRecord } from '@/repositories/milk';
import { colors, fonts, radius, spacing, touchTarget } from '@/lib/theme/tokens';
import type { MilkSession } from '@/types/domain';

/**
 * Screen 10 — record milk: date defaults to today, morning/afternoon
 * segmented control, large numeric input, shows any existing record for the
 * session, and saves locally with immediate confirmation regardless of
 * network state (PRODUCT_SPEC §7).
 */
export default function MilkFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { activeFarmId, user } = useAuth();

  const [date, setDate] = useState(todayIsoDate());
  const [session, setSession] = useState<MilkSession>('morning');
  const [liters, setLiters] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const cow = getCow(getDatabase(), id);

  const existingQuery = useCallback(
    (driver: Parameters<typeof getMilkRecord>[0]) =>
      activeFarmId ? getMilkRecord(driver, activeFarmId, id, date, session) : null,
    [activeFarmId, id, date, session],
  );
  const { data: existing, reload } = useLocalQuery(existingQuery);

  const save = () => {
    if (!activeFarmId || !user) return;
    setError(null);
    const value = Number(liters.replace(',', '.'));
    try {
      upsertMilkRecord(
        getDatabase(),
        { farmId: activeFarmId, cowId: id, recordDate: date, session, liters: value },
        user.id,
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSavedNotice(true);
      setLiters('');
      reload();
      setTimeout(() => setSavedNotice(false), 2500);
    } catch (err) {
      // Input is preserved on failure (PRODUCT_SPEC §7).
      setError(domainErrorMessage(err));
    }
  };

  return (
    <ScreenContainer scroll>
      <ScreenHeader title={`${strings.milk.recordMilk} · ${cow?.name ?? ''}`} />
      <OfflineBanner />

      <Text style={styles.fieldLabel}>{strings.milk.date}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.milk.date}
        onPress={() => setShowDatePicker(true)}
        style={styles.dateButton}
      >
        <Text style={styles.dateValue}>{date}</Text>
      </Pressable>
      {showDatePicker ? (
        <DateTimePicker
          value={new Date(`${date}T12:00:00`)}
          mode="date"
          maximumDate={new Date()}
          onChange={(event, picked) => {
            setShowDatePicker(false);
            if (event.type === 'set' && picked) setDate(toIsoDate(picked));
          }}
        />
      ) : null}

      <Text style={styles.fieldLabel}>{strings.milk.session}</Text>
      <SegmentedControl<MilkSession>
        options={[
          { value: 'morning', label: strings.milk.morning },
          { value: 'afternoon', label: strings.milk.afternoon },
        ]}
        value={session}
        onChange={setSession}
      />

      {existing ? (
        <View style={styles.existingBox} accessibilityRole="text">
          <Text style={styles.existingText}>
            {strings.milk.existingRecord} ({existing.liters} {strings.common.liters})
          </Text>
        </View>
      ) : null}

      <View style={styles.litersWrap}>
        <TextField
          label={strings.milk.litersLabel}
          value={liters}
          onChangeText={setLiters}
          keyboardType="decimal-pad"
          style={styles.litersInput}
          placeholder="0.0"
          error={error}
        />
      </View>

      {savedNotice ? (
        <Text style={styles.savedNotice} accessibilityLiveRegion="polite">
          ✓ {strings.milk.savedLocally}
        </Text>
      ) : null}

      <AppButton
        title={strings.common.save}
        onPress={save}
        disabled={liters.trim() === ''}
        style={styles.saveButton}
      />
      <AppButton
        title={strings.milk.viewHistory}
        variant="secondary"
        onPress={() => router.push({ pathname: '/cow/[id]/history', params: { id } })}
        style={styles.historyButton}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  dateButton: {
    minHeight: touchTarget.field,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.borderInput,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  dateValue: {
    fontFamily: fonts.numericSemiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  existingBox: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  existingText: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.textMuted,
  },
  litersWrap: {
    marginTop: spacing.md,
  },
  litersInput: {
    fontFamily: fonts.numericBold,
    fontSize: 32,
    minHeight: 64,
    textAlign: 'center',
  },
  savedNotice: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  saveButton: {
    marginTop: spacing.sm,
  },
  historyButton: {
    marginTop: spacing.sm,
  },
});
