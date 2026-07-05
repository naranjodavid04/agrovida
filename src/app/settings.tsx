import Constants from 'expo-constants';
import { Redirect, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { getDatabase } from '@/db/database';
import { useAuth } from '@/features/auth/AuthProvider';
import { exportAndShareCsv } from '@/features/export/share';
import type { ExportKind } from '@/features/export/csv';
import { strings } from '@/lib/i18n/strings';
import { colors, fonts, radius, spacing, touchTarget } from '@/lib/theme/tokens';

const EXPORT_OPTIONS: { kind: ExportKind; label: string }[] = [
  { kind: 'cows', label: strings.export.cows },
  { kind: 'milk', label: strings.export.milk },
  { kind: 'health', label: strings.export.health },
  { kind: 'repro', label: strings.export.repro },
  { kind: 'sales', label: strings.export.sales },
];

/**
 * Screen 14 — settings/account: identity, active farm switch, owner links,
 * CSV export, sync diagnostics, and D-015 logout.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const { status, user, farms, activeFarmId, role, signOut } = useAuth();
  const farm = farms.find((f) => f.id === activeFarmId);
  const [showExport, setShowExport] = useState(false);

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

  const exportCsv = async (kind: ExportKind) => {
    setShowExport(false);
    if (!activeFarmId) return;
    try {
      await exportAndShareCsv(getDatabase(), activeFarmId, farm?.name ?? 'finca', kind);
    } catch (error) {
      Alert.alert(strings.export.failed, error instanceof Error ? error.message : String(error));
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
          title={strings.reminders.title}
          variant="secondary"
          onPress={() => router.push('/reminders' as Href)}
          style={styles.button}
        />
        <AppButton
          title={strings.export.title}
          variant="secondary"
          onPress={() => setShowExport(true)}
          style={styles.button}
        />
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

      <Modal visible={showExport} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowExport(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{strings.export.title}</Text>
            {EXPORT_OPTIONS.map((option) => (
              <Pressable
                key={option.kind}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                onPress={() => void exportCsv(option.kind)}
                style={({ pressed }) => [styles.modalRow, pressed && styles.pressed]}
              >
                <Text style={styles.modalRowText}>{option.label}</Text>
              </Pressable>
            ))}
            <AppButton
              title={strings.common.cancel}
              variant="secondary"
              onPress={() => setShowExport(false)}
              style={styles.modalCancel}
            />
          </Pressable>
        </Pressable>
      </Modal>
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
  pressed: {
    opacity: 0.85,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(22, 33, 28, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.appBackground,
    borderTopLeftRadius: radius.mainCard,
    borderTopRightRadius: radius.mainCard,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  modalRow: {
    minHeight: touchTarget.field,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    paddingHorizontal: spacing.xs,
  },
  modalRowText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  modalCancel: {
    marginTop: spacing.md,
  },
});
