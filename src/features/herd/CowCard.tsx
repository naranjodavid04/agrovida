import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { CowPhoto } from '@/components/CowPhoto';
import { DeltaBadge } from '@/components/DeltaBadge';
import { Sparkline } from '@/components/Sparkline';
import { StatusChips } from '@/components/StatusChips';
import { strings } from '@/lib/i18n/strings';
import { colors, fonts, radius, spacing } from '@/lib/theme/tokens';

import { formatAge, formatLiters, type CowCardData } from './queries';

/**
 * Design A carousel card (DESIGN_SPEC §2): photo banner with status chips,
 * name/breed, today's liters as the dominant number, yesterday delta,
 * seven-day sparkline, age/calvings/tag, and the profile action.
 */

interface Props {
  data: CowCardData;
}

export function CowCard({ data }: Props) {
  const router = useRouter();
  const { cow, today, delta, trend } = data;

  return (
    <View style={styles.card}>
      <View style={styles.photoWrap}>
        <CowPhoto cow={cow} style={styles.photo} />
        <View style={styles.chipOverlay}>
          <StatusChips cow={cow} />
        </View>
      </View>
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {cow.name}
          </Text>
          {cow.breed ? <Text style={styles.breed}>· {cow.breed}</Text> : null}
        </View>

        <View style={styles.milkRow}>
          <View>
            <Text style={styles.milkLabel}>{strings.milk.milkToday.toUpperCase()}</Text>
            <View style={styles.milkValueRow}>
              <Text style={styles.milkValue}>{formatLiters(today)}</Text>
              <Text style={styles.milkUnit}>{strings.common.liters}</Text>
            </View>
            <DeltaBadge delta={delta.delta} />
          </View>
          <View style={styles.sparkWrap}>
            <Sparkline values={trend.map((p) => p.total)} width={88} height={36} />
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{strings.herd.age.toUpperCase()}</Text>
            <Text style={styles.statValue}>{formatAge(cow.birthDate)}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{strings.herd.calvingCount.toUpperCase()}</Text>
            <Text style={styles.statValue}>{cow.calvingCount}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{strings.herd.tag.toUpperCase()}</Text>
            <Text style={styles.statValue}>{cow.tagNumber ?? '—'}</Text>
          </View>
        </View>

        <AppButton
          title={strings.herd.viewProfile}
          onPress={() => router.push({ pathname: '/cow/[id]', params: { id: cow.id } })}
          style={styles.button}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.mainCard,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: 'hidden',
  },
  photoWrap: {
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: 168,
  },
  chipOverlay: {
    position: 'absolute',
    left: spacing.md,
    top: spacing.md,
  },
  body: {
    padding: spacing.lg,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  name: {
    fontFamily: fonts.extraBold,
    fontSize: 23,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  breed: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  milkRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: spacing.md,
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
    marginTop: 2,
  },
  milkValue: {
    fontFamily: fonts.numericBold,
    fontSize: 46,
    lineHeight: 48,
    color: colors.textPrimary,
  },
  milkUnit: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    color: colors.textSecondary,
  },
  sparkWrap: {
    marginBottom: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    fontFamily: fonts.bold,
    fontSize: 10.5,
    letterSpacing: 0.5,
    color: colors.textSecondary,
  },
  statValue: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.textPrimary,
    marginTop: 2,
  },
  button: {
    marginTop: spacing.lg,
  },
});
