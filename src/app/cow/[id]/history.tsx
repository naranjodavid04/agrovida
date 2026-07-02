import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { getDatabase } from '@/db/database';
import { formatLiters } from '@/features/herd/queries';
import { useLocalQuery } from '@/features/herd/useLocalQuery';
import { strings } from '@/lib/i18n/strings';
import { getCow } from '@/repositories/cows';
import { listMilkHistory } from '@/repositories/milk';
import { colors, fonts, radius, spacing } from '@/lib/theme/tokens';

/** Screen 11 — simple per-cow milk history list. */
export default function MilkHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cow = getCow(getDatabase(), id);

  const query = useCallback(
    (driver: Parameters<typeof listMilkHistory>[0]) => listMilkHistory(driver, id, 90),
    [id],
  );
  const { data } = useLocalQuery(query);
  const records = data ?? [];

  return (
    <ScreenContainer>
      <ScreenHeader title={`${strings.milk.history} · ${cow?.name ?? ''}`} />
      <FlatList
        data={records}
        keyExtractor={(record) => record.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<EmptyState title={strings.milk.noRecords} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View>
              <Text style={styles.date}>{item.recordDate}</Text>
              <Text style={styles.session}>
                {item.session === 'morning' ? strings.milk.morning : strings.milk.afternoon}
              </Text>
            </View>
            <Text style={styles.liters}>
              {formatLiters(item.liters)} {strings.common.liters}
            </Text>
          </View>
        )}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
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
  date: {
    fontFamily: fonts.numericSemiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  session: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  liters: {
    fontFamily: fonts.numericBold,
    fontSize: 18,
    color: colors.textPrimary,
  },
});
