import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CowPhoto } from '@/components/CowPhoto';
import { EmptyState } from '@/components/EmptyState';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Sparkline } from '@/components/Sparkline';
import { StatusChips } from '@/components/StatusChips';
import { SyncBadge } from '@/components/SyncBadge';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatLiters, loadCowCards } from '@/features/herd/queries';
import { useLocalQuery } from '@/features/herd/useLocalQuery';
import { strings } from '@/lib/i18n/strings';
import { colors, fonts, radius, spacing, touchTarget } from '@/lib/theme/tokens';

/**
 * Screen 7 — searchable herd list: 48dp thumbnail, name + chips, today's
 * total and a tiny sparkline (DESIGN_SPEC §8), with empty/no-result states.
 */
export default function HerdScreen() {
  const { activeFarmId } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState('');

  const query = useCallback(
    (driver: Parameters<typeof loadCowCards>[0]) =>
      activeFarmId ? loadCowCards(driver, activeFarmId, search) : [],
    [activeFarmId, search],
  );
  const { data } = useLocalQuery(query);
  const cards = data ?? [];

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>{strings.herd.title}</Text>
        <SyncBadge />
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder={strings.herd.searchPlaceholder}
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          accessibilityLabel={strings.herd.searchPlaceholder}
          autoCapitalize="none"
        />
      </View>

      <FlatList
        data={cards}
        keyExtractor={(item) => item.cow.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <EmptyState
            title={search ? strings.herd.noResults : strings.herd.noCows}
            subtitle={search ? undefined : strings.farm.createFirstFarm}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.cow.name}, ${formatLiters(item.today)} ${strings.common.liters}`}
            onPress={() => router.push({ pathname: '/cow/[id]', params: { id: item.cow.id } })}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <CowPhoto cow={item.cow} style={styles.thumbnail} />
            <View style={styles.rowBody}>
              <Text style={styles.rowName} numberOfLines={1}>
                {item.cow.name}
                {item.cow.tagNumber ? `  ·  ${item.cow.tagNumber}` : ''}
              </Text>
              <StatusChips cow={item.cow} />
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowLiters}>
                {formatLiters(item.today)} {strings.common.liters}
              </Text>
              <Sparkline values={item.trend.map((p) => p.total)} width={56} height={20} />
            </View>
          </Pressable>
        )}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.herd.addCow}
        onPress={() => router.push('/cow/new')}
        style={styles.fab}
      >
        <Ionicons name="add" size={28} color={colors.onPrimary} />
      </Pressable>
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: touchTarget.field,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.borderInput,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 96,
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
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: radius.input,
  },
  rowBody: {
    flex: 1,
    gap: spacing.xs,
  },
  rowName: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  rowLiters: {
    fontFamily: fonts.numericSemiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
});
