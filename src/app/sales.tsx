import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { EmptyState } from '@/components/EmptyState';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { getDatabase } from '@/db/database';
import { useAuth } from '@/features/auth/AuthProvider';
import { domainErrorMessage } from '@/features/herd/errorMessages';
import { formatLiters } from '@/features/herd/queries';
import { useLocalQuery } from '@/features/herd/useLocalQuery';
import { useSync } from '@/features/sync/SyncProvider';
import { toIsoDate, todayIsoDate } from '@/lib/dates';
import { strings } from '@/lib/i18n/strings';
import { formatCOP } from '@/lib/money';
import { createMilkSale, listMilkSales, monthlySalesSummary } from '@/repositories/sales';
import { colors, fonts, radius, spacing, touchTarget } from '@/lib/theme/tokens';

function parseDecimal(value: string): number {
  return Number(value.replace(',', '.'));
}

/**
 * Milk sales/settlements (ROADMAP H1): deliveries to the buyer with price
 * and optional quality; the monthly income is derived (liters × price).
 */
export default function SalesScreen() {
  const { activeFarmId, user } = useAuth();
  const { notifyLocalChange } = useSync();

  const [saleDate, setSaleDate] = useState(todayIsoDate());
  const [liters, setLiters] = useState('');
  const [price, setPrice] = useState('');
  const [fat, setFat] = useState('');
  const [protein, setProtein] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useCallback(
    (driver: Parameters<typeof listMilkSales>[0]) =>
      activeFarmId
        ? {
            sales: listMilkSales(driver, activeFarmId),
            month: monthlySalesSummary(driver, activeFarmId, todayIsoDate().slice(0, 7)),
          }
        : null,
    [activeFarmId],
  );
  const { data, reload } = useLocalQuery(query);

  const save = () => {
    if (!activeFarmId || !user) return;
    setError(null);
    try {
      createMilkSale(
        getDatabase(),
        {
          farmId: activeFarmId,
          saleDate,
          liters: parseDecimal(liters),
          pricePerLiter: parseDecimal(price),
          fatPercent: fat.trim() === '' ? null : parseDecimal(fat),
          proteinPercent: protein.trim() === '' ? null : parseDecimal(protein),
          notes: null,
        },
        user.id,
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLiters('');
      setFat('');
      setProtein('');
      reload();
      notifyLocalChange();
    } catch (err) {
      setError(domainErrorMessage(err));
    }
  };

  return (
    <ScreenContainer>
      <ScreenHeader title={strings.sales.title} />
      <OfflineBanner />
      <FlatList
        data={data?.sales ?? []}
        keyExtractor={(sale) => sale.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <View style={styles.monthCard}>
              <Text style={styles.monthLabel}>{strings.sales.monthTotal.toUpperCase()}</Text>
              <View style={styles.monthRow}>
                <View style={styles.monthStat}>
                  <Text style={styles.monthValue}>
                    {formatLiters(data?.month.liters ?? 0)} {strings.common.liters}
                  </Text>
                </View>
                <View style={styles.monthStat}>
                  <Text style={styles.monthValue}>{formatCOP(data?.month.income ?? 0)}</Text>
                  <Text style={styles.monthSub}>{strings.sales.income}</Text>
                </View>
              </View>
            </View>

            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>{strings.sales.addSale}</Text>
              <Text style={styles.fieldLabel}>{strings.milk.date}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={strings.milk.date}
                onPress={() => setShowDatePicker(true)}
                style={styles.dateButton}
              >
                <Text style={styles.dateValue}>{saleDate}</Text>
              </Pressable>
              {showDatePicker ? (
                <DateTimePicker
                  value={new Date(`${saleDate}T12:00:00`)}
                  mode="date"
                  maximumDate={new Date()}
                  onChange={(pickerEvent, picked) => {
                    setShowDatePicker(false);
                    if (pickerEvent.type === 'set' && picked) setSaleDate(toIsoDate(picked));
                  }}
                />
              ) : null}

              <TextField
                label={strings.sales.liters}
                value={liters}
                onChangeText={setLiters}
                keyboardType="decimal-pad"
              />
              <TextField
                label={strings.sales.pricePerLiter}
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
              />
              <TextField
                label={strings.sales.fatPercent}
                value={fat}
                onChangeText={setFat}
                keyboardType="decimal-pad"
              />
              <TextField
                label={strings.sales.proteinPercent}
                value={protein}
                onChangeText={setProtein}
                keyboardType="decimal-pad"
              />

              {error ? (
                <Text style={styles.error} accessibilityRole="alert">
                  {error}
                </Text>
              ) : null}
              <AppButton
                title={strings.common.save}
                onPress={save}
                disabled={liters.trim() === '' || price.trim() === ''}
              />
            </View>
            {(data?.sales ?? []).length === 0 ? <EmptyState title={strings.sales.noSales} /> : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{item.saleDate}</Text>
              <Text style={styles.rowSub}>
                {formatLiters(item.liters)} {strings.common.liters} ×{' '}
                {formatCOP(item.pricePerLiter)}
                {item.fatPercent !== null ? `  ·  ${formatLiters(item.fatPercent)}% grasa` : ''}
              </Text>
            </View>
            <Text style={styles.rowTotal}>{formatCOP(item.liters * item.pricePerLiter)}</Text>
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
  monthCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.detailPanel,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  monthLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.textSecondary,
  },
  monthRow: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.sm,
  },
  monthStat: {
    flex: 1,
  },
  monthValue: {
    fontFamily: fonts.numericBold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  monthSub: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textMuted,
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
    marginBottom: spacing.lg,
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
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.listRow,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: fonts.numericSemiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  rowSub: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  rowTotal: {
    fontFamily: fonts.numericBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
});
