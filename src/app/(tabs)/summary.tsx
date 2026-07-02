import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { DeltaBadge } from '@/components/DeltaBadge';
import { EmptyState } from '@/components/EmptyState';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Sparkline } from '@/components/Sparkline';
import { SyncBadge } from '@/components/SyncBadge';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatLiters, loadFarmSummary } from '@/features/herd/queries';
import { useLocalQuery } from '@/features/herd/useLocalQuery';
import { strings } from '@/lib/i18n/strings';
import { colors, fonts, radius, spacing } from '@/lib/theme/tokens';

/**
 * Screen 12 — farm daily summary: farm total today (dominant), yesterday
 * comparison, seven-day farm sparkline, and per-cow totals.
 */
export default function SummaryScreen() {
  const { activeFarmId, farms } = useAuth();
  const router = useRouter();
  const farm = farms.find((f) => f.id === activeFarmId);

  const query = useCallback(
    (driver: Parameters<typeof loadFarmSummary>[0]) =>
      activeFarmId ? loadFarmSummary(driver, activeFarmId) : null,
    [activeFarmId],
  );
  const { data } = useLocalQuery(query);

  const withRecords = (data?.cards ?? []).filter((c) => c.today > 0);
  const withoutRecords = (data?.cards ?? []).filter((c) => c.today === 0);
  const hasYesterday = (data?.yesterdayTotal ?? 0) > 0;

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>{strings.milk.daySummary}</Text>
        <SyncBadge />
      </View>

      <FlatList
        data={withRecords}
        keyExtractor={(item) => item.cow.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <View style={styles.totalCard}>
              <Text style={styles.farmName}>{farm?.name ?? ''}</Text>
              <Text style={styles.totalLabel}>{strings.milk.farmTotalToday.toUpperCase()}</Text>
              <View style={styles.totalRow}>
                <Text style={styles.totalValue}>{formatLiters(data?.total ?? 0)}</Text>
                <Text style={styles.totalUnit}>{strings.common.liters}</Text>
              </View>
              <DeltaBadge
                delta={hasYesterday ? (data?.total ?? 0) - (data?.yesterdayTotal ?? 0) : null}
              />
              <View style={styles.sparkWrap}>
                <Sparkline
                  values={(data?.trend ?? []).map((p) => p.total)}
                  width={220}
                  height={44}
                />
              </View>
            </View>
            {withRecords.length > 0 ? (
              <Text style={styles.sectionTitle}>{strings.milk.cowsWithRecords}</Text>
            ) : (
              <EmptyState title={strings.milk.noRecordsToday} />
            )}
          </>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.cow.name}: ${formatLiters(item.today)} ${strings.common.liters}`}
            onPress={() => router.push({ pathname: '/cow/[id]', params: { id: item.cow.id } })}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Text style={styles.rowName} numberOfLines={1}>
              {item.cow.name}
            </Text>
            <Text style={styles.rowLiters}>
              {formatLiters(item.today)} {strings.common.liters}
            </Text>
          </Pressable>
        )}
        ListFooterComponent={
          withoutRecords.length > 0 ? (
            <Text style={styles.footerNote}>
              {strings.milk.cowsWithoutRecords}: {withoutRecords.map((c) => c.cow.name).join(', ')}
            </Text>
          ) : null
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  totalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.mainCard,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  farmName: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  totalLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.textSecondary,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  totalValue: {
    fontFamily: fonts.numericBold,
    fontSize: 56,
    lineHeight: 60,
    color: colors.textPrimary,
  },
  totalUnit: {
    fontFamily: fonts.semiBold,
    fontSize: 18,
    color: colors.textSecondary,
  },
  sparkWrap: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.listRow,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  pressed: {
    opacity: 0.85,
  },
  rowName: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  rowLiters: {
    fontFamily: fonts.numericSemiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  footerNote: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
});
