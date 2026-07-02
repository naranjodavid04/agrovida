import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { CowPhoto } from '@/components/CowPhoto';
import { DeltaBadge } from '@/components/DeltaBadge';
import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Sparkline } from '@/components/Sparkline';
import { StatusChips } from '@/components/StatusChips';
import { getDatabase } from '@/db/database';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatAge, formatLiters, loadCowCard, loadGenealogy } from '@/features/herd/queries';
import { useLocalQuery } from '@/features/herd/useLocalQuery';
import { strings } from '@/lib/i18n/strings';
import { setLifecycleStatus } from '@/repositories/cows';
import { colors, fonts, radius, spacing, touchTarget } from '@/lib/theme/tokens';
import type { LifecycleStatus } from '@/types/domain';

/**
 * Screen 8 — cow detail: photo, independent status chips, production block,
 * info, genealogy navigation (mother/daughters), milk actions, and the
 * owner-only lifecycle change (PRODUCT_SPEC §3).
 */
export default function CowDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { role } = useAuth();

  const query = useCallback(
    (driver: Parameters<typeof loadCowCard>[0]) => {
      const card = loadCowCard(driver, id);
      return card ? { card, genealogy: loadGenealogy(driver, card.cow) } : null;
    },
    [id],
  );
  const { data, reload } = useLocalQuery(query);

  if (!data) {
    return (
      <ScreenContainer>
        <ScreenHeader title={strings.herd.title} />
      </ScreenContainer>
    );
  }
  const { card, genealogy } = data;
  const cow = card.cow;

  const changeLifecycle = () => {
    const options: { label: string; value: LifecycleStatus }[] = [
      { label: strings.status.active, value: 'active' },
      { label: strings.status.sold, value: 'sold' },
      { label: strings.status.deceased, value: 'deceased' },
      { label: strings.status.culled, value: 'culled' },
    ];
    Alert.alert(strings.herd.changeLifecycle, cow.name, [
      ...options
        .filter((option) => option.value !== cow.lifecycleStatus)
        .map((option) => ({
          text: option.label,
          onPress: () => {
            setLifecycleStatus(getDatabase(), cow.id, option.value);
            reload();
          },
        })),
      { text: strings.common.cancel, style: 'cancel' as const },
    ]);
  };

  return (
    <ScreenContainer>
      <ScreenHeader title={cow.name} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.photoCard}>
          <CowPhoto cow={cow} style={styles.photo} />
          {cow.photoLocalUri && !cow.photoPath ? (
            <Text style={styles.photoPending}>{strings.herd.photoPending}</Text>
          ) : null}
        </View>

        <View style={styles.chipsRow}>
          <StatusChips cow={cow} verbose />
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{strings.herd.production}</Text>
          <View style={styles.milkRow}>
            <View>
              <Text style={styles.milkLabel}>{strings.milk.milkToday.toUpperCase()}</Text>
              <View style={styles.milkValueRow}>
                <Text style={styles.milkValue}>{formatLiters(card.today)}</Text>
                <Text style={styles.milkUnit}>{strings.common.liters}</Text>
              </View>
              <DeltaBadge delta={card.delta.delta} />
            </View>
            <Sparkline values={card.trend.map((p) => p.total)} width={96} height={40} />
          </View>
          <View style={styles.actionsRow}>
            <AppButton
              title={strings.milk.recordMilk}
              onPress={() => router.push({ pathname: '/cow/[id]/milk', params: { id: cow.id } })}
              style={styles.actionButton}
            />
            <AppButton
              title={strings.milk.history}
              variant="secondary"
              onPress={() => router.push({ pathname: '/cow/[id]/history', params: { id: cow.id } })}
              style={styles.actionButton}
            />
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{strings.herd.info}</Text>
          <InfoRow label={strings.herd.breed} value={cow.breed ?? '—'} />
          <InfoRow
            label={strings.herd.age}
            value={`${formatAge(cow.birthDate)}${cow.birthDateIsEstimated ? ` (${strings.herd.birthDateEstimated.toLowerCase()})` : ''}`}
          />
          <InfoRow label={strings.herd.birthDate} value={cow.birthDate ?? '—'} />
          <InfoRow label={strings.herd.calvingCount} value={String(cow.calvingCount)} />
          <InfoRow label={strings.herd.tag} value={cow.tagNumber ?? '—'} />
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{strings.herd.genealogy}</Text>
          <Text style={styles.subLabel}>{strings.herd.mother}</Text>
          {genealogy.mother ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${strings.herd.mother}: ${genealogy.mother.name}`}
              onPress={() =>
                router.push({ pathname: '/cow/[id]', params: { id: genealogy.mother!.id } })
              }
              style={styles.linkRow}
            >
              <Text style={styles.linkText}>{genealogy.mother.name}</Text>
            </Pressable>
          ) : (
            <Text style={styles.mutedText}>{strings.herd.noMother}</Text>
          )}
          <Text style={[styles.subLabel, { marginTop: spacing.md }]}>{strings.herd.daughters}</Text>
          {genealogy.daughters.length === 0 ? (
            <Text style={styles.mutedText}>—</Text>
          ) : (
            genealogy.daughters.map((daughter) => (
              <Pressable
                key={daughter.id}
                accessibilityRole="button"
                accessibilityLabel={`${strings.herd.daughters}: ${daughter.name}`}
                onPress={() => router.push({ pathname: '/cow/[id]', params: { id: daughter.id } })}
                style={styles.linkRow}
              >
                <Text style={styles.linkText}>{daughter.name}</Text>
              </Pressable>
            ))
          )}
        </View>

        <AppButton
          title={strings.herd.editCow}
          variant="secondary"
          onPress={() => router.push({ pathname: '/cow/[id]/edit', params: { id: cow.id } })}
        />
        {role === 'owner' ? (
          <View style={styles.lifecycleBox}>
            <Text style={styles.panelTitle}>{strings.herd.lifecycleSection}</Text>
            <AppButton
              title={strings.herd.changeLifecycle}
              variant="secondary"
              onPress={changeLifecycle}
            />
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  photoCard: {
    borderRadius: radius.detailPanel,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: 190,
    borderRadius: radius.detailPanel,
  },
  photoPending: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  chipsRow: {
    marginTop: spacing.xs,
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.detailPanel,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
  },
  panelTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  milkRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  milkLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.textSecondary,
  },
  milkValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    marginVertical: 2,
  },
  milkValue: {
    fontFamily: fonts.numericBold,
    fontSize: 38,
    lineHeight: 42,
    color: colors.textPrimary,
  },
  milkUnit: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.textSecondary,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  actionButton: {
    flex: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  infoLabel: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textMuted,
  },
  infoValue: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  subLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.5,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  linkRow: {
    minHeight: touchTarget.min,
    justifyContent: 'center',
  },
  linkText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.primary,
  },
  mutedText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textMuted,
  },
  lifecycleBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.detailPanel,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
  },
});
