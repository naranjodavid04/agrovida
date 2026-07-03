import Constants from 'expo-constants';
import { Redirect, useRouter } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAuth } from '@/features/auth/AuthProvider';
import { strings } from '@/lib/i18n/strings';
import { colors, fonts, radius, spacing } from '@/lib/theme/tokens';

/**
 * Screen 14 — settings/account: identity, active farm switch, owner links,
 * sync diagnostics, and D-015 logout (warns when local changes are pending).
 */
export default function SettingsScreen() {
  const router = useRouter();
  const { status, user, farms, activeFarmId, role, signOut } = useAuth();
  const farm = farms.find((f) => f.id === activeFarmId);

  // After a confirmed logout the state flips to signedOut; leave this screen
  // immediately instead of staying on a stale settings view.
  if (status === 'signedOut') return <Redirect href="/login" />;

  const logout = async () => {
    const result = await signOut();
    if (result === 'pending_changes') {
      Alert.alert(strings.auth.logout, strings.auth.logoutPendingWarning, [
        {
          text: strings.common.confirm,
          style: 'destructive',
          onPress: () => void signOut({ force: true }),
        },
        { text: strings.common.cancel, style: 'cancel' },
      ]);
    }
  };

  return (
    <ScreenContainer>
      <ScreenHeader title={strings.settings.title} />
      <OfflineBanner />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>{strings.settings.account}</Text>
          <InfoRow label={strings.auth.email} value={user?.email ?? '—'} />
          <InfoRow
            label={strings.settings.activeFarm}
            value={
              farm
                ? `${farm.name} (${role === 'owner' ? strings.farm.roleOwner : strings.farm.roleWorker})`
                : '—'
            }
          />
          <InfoRow label={strings.settings.version} value={Constants.expoConfig?.version ?? '—'} />
        </View>

        <AppButton
          title={strings.farm.switchFarm}
          variant="secondary"
          onPress={() => router.push('/farm-select')}
          style={styles.button}
        />
        {role === 'owner' ? (
          <AppButton
            title={strings.settings.members}
            variant="secondary"
            onPress={() => router.push('/members')}
            style={styles.button}
          />
        ) : null}
        <AppButton
          title={strings.settings.syncStatus}
          variant="secondary"
          onPress={() => router.push('/sync-status')}
          style={styles.button}
        />
        <AppButton
          title={strings.auth.logout}
          variant="danger"
          onPress={() => void logout()}
          style={styles.logout}
        />
      </ScrollView>
    </ScreenContainer>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  panel: {
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
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
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
    flexShrink: 1,
  },
  button: {
    marginBottom: spacing.sm,
  },
  logout: {
    marginTop: spacing.xl,
  },
});
