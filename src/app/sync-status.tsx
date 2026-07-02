import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { EmptyState } from '@/components/EmptyState';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { getDatabase } from '@/db/database';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLocalQuery } from '@/features/herd/useLocalQuery';
import { resolveKeepServer, resolveUseLocal } from '@/features/sync/conflictService';
import { useSync } from '@/features/sync/SyncProvider';
import { strings } from '@/lib/i18n/strings';
import { getRecentLogs } from '@/lib/logger';
import { listOpenConflicts } from '@/repositories/conflicts';
import { colors, fonts, radius, spacing } from '@/lib/theme/tokens';

/**
 * Screen 15 — sync diagnostics: state, pending count, last success/error,
 * open conflicts with explicit resolution (D-016), manual retry, and the
 * redacted diagnostics log.
 */
export default function SyncStatusScreen() {
  const { snapshot, retryNow } = useSync();
  const { activeFarmId, user, role } = useAuth();

  const conflictsQuery = useCallback(
    (driver: Parameters<typeof listOpenConflicts>[0]) =>
      activeFarmId ? listOpenConflicts(driver, activeFarmId) : [],
    [activeFarmId],
  );
  const { data: conflicts, reload } = useLocalQuery(conflictsQuery);

  const statusLabel: Record<typeof snapshot.status, string> = {
    idle: strings.sync.pendingChanges,
    offline: strings.sync.offline,
    syncing: strings.sync.syncing,
    synced: strings.sync.synced,
    error: strings.sync.actionRequired,
    action_required: strings.sync.actionRequired,
  };

  return (
    <ScreenContainer>
      <ScreenHeader title={strings.sync.diagnostics} />
      <OfflineBanner />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.panel}>
          <InfoRow label={strings.a11y.syncIndicator} value={statusLabel[snapshot.status]} />
          <InfoRow label={strings.sync.pendingChanges} value={String(snapshot.pendingCount)} />
          <InfoRow
            label={strings.sync.lastSync}
            value={
              snapshot.lastSuccessAt
                ? new Date(snapshot.lastSuccessAt).toLocaleString('es-CO')
                : strings.sync.never
            }
          />
          {snapshot.lastError ? <Text style={styles.errorText}>{snapshot.lastError}</Text> : null}
          <Text style={styles.safeNote}>{strings.sync.dataSafeLocally}</Text>
          <AppButton title={strings.sync.retryNow} onPress={retryNow} style={styles.retry} />
        </View>

        <Text style={styles.sectionTitle}>{strings.sync.conflicts}</Text>
        {(conflicts ?? []).length === 0 ? (
          <EmptyState title={strings.sync.noConflicts} />
        ) : (
          (conflicts ?? []).map((conflict) => {
            const local = JSON.parse(conflict.local_payload_json) as Record<string, unknown>;
            const server = conflict.server_payload_json
              ? (JSON.parse(conflict.server_payload_json) as Record<string, unknown>)
              : null;
            return (
              <View key={conflict.id} style={styles.conflictCard}>
                <Text style={styles.conflictTitle}>{strings.sync.conflictTitle}</Text>
                <Text style={styles.conflictBody}>{strings.sync.conflictMilkBody}</Text>
                <Text style={styles.conflictValues}>
                  {strings.sync.keepLocal}: {String(local.liters ?? '—')} {strings.common.liters}
                  {'   ·   '}
                  {strings.sync.keepServer}: {String(server?.liters ?? '—')} {strings.common.liters}
                </Text>
                <View style={styles.conflictActions}>
                  <AppButton
                    title={strings.sync.keepServer}
                    variant="secondary"
                    onPress={() => {
                      resolveKeepServer(getDatabase(), conflict);
                      reload();
                    }}
                    style={styles.conflictButton}
                  />
                  {role === 'owner' && user ? (
                    <AppButton
                      title={strings.sync.keepLocal}
                      onPress={() => {
                        resolveUseLocal(getDatabase(), conflict, user.id);
                        reload();
                      }}
                      style={styles.conflictButton}
                    />
                  ) : null}
                </View>
              </View>
            );
          })
        )}

        <Text style={styles.sectionTitle}>{strings.sync.diagnosticsLog}</Text>
        <View style={styles.logBox}>
          {getRecentLogs()
            .slice(-30)
            .reverse()
            .map((entry, index) => (
              <Text key={index} style={styles.logLine}>
                {entry.timestamp.slice(11, 19)} [{entry.level}] {entry.scope}: {entry.message}
              </Text>
            ))}
        </View>
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
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.detailPanel,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
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
  errorText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  safeNote: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  retry: {
    marginTop: spacing.md,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.textPrimary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  conflictCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.detailPanel,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  conflictTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  conflictBody: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  conflictValues: {
    fontFamily: fonts.numericSemiBold,
    fontSize: 13,
    color: colors.textPrimary,
    marginVertical: spacing.md,
  },
  conflictActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  conflictButton: {
    flex: 1,
  },
  logBox: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.md,
  },
  logLine: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 2,
  },
});
