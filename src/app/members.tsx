import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { EmptyState } from '@/components/EmptyState';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TextField } from '@/components/TextField';
import { getDatabase } from '@/db/database';
import { useAuth } from '@/features/auth/AuthProvider';
import { authErrorMessage } from '@/features/auth/errors';
import { deactivateMember, inviteMember } from '@/features/bootstrap/service';
import { useLocalQuery } from '@/features/herd/useLocalQuery';
import { strings } from '@/lib/i18n/strings';
import { getSupabase } from '@/lib/supabase';
import { listInvites, listMembers } from '@/repositories/farms';
import { colors, fonts, radius, spacing } from '@/lib/theme/tokens';
import type { FarmRole } from '@/types/domain';

/**
 * Screen 13 — members and invitations (owner only): list/deactivate
 * memberships and create invitations. These actions require connectivity;
 * the lists read from the local cache.
 */
export default function MembersScreen() {
  const { activeFarmId, user, role, refreshBootstrap } = useAuth();
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<FarmRole>('worker');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const query = useCallback(
    (driver: Parameters<typeof listMembers>[0]) =>
      activeFarmId
        ? { members: listMembers(driver, activeFarmId), invites: listInvites(driver, activeFarmId) }
        : { members: [], invites: [] },
    [activeFarmId],
  );
  const { data, reload } = useLocalQuery(query);

  if (role !== 'owner') {
    return (
      <ScreenContainer>
        <ScreenHeader title={strings.farm.members} />
        <EmptyState title={strings.herd.lifecycleOwnerOnly} />
      </ScreenContainer>
    );
  }

  const sendInvite = async () => {
    if (!activeFarmId || !user) return;
    setError(null);
    setBusy(true);
    try {
      await inviteMember(getDatabase(), getSupabase(), activeFarmId, email, inviteRole, user);
      setEmail('');
      reload();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const deactivate = (memberId: string, userId: string) => {
    Alert.alert(strings.farm.deactivateMember, userId, [
      {
        text: strings.common.confirm,
        style: 'destructive',
        onPress: async () => {
          try {
            await deactivateMember(getDatabase(), getSupabase(), memberId);
            await refreshBootstrap().catch(() => undefined);
            reload();
          } catch (err) {
            setError(authErrorMessage(err));
          }
        },
      },
      { text: strings.common.cancel, style: 'cancel' },
    ]);
  };

  return (
    <ScreenContainer>
      <ScreenHeader title={strings.farm.members} />
      <OfflineBanner />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>{strings.farm.members}</Text>
        {(data?.members ?? []).map((member) => (
          <View key={member.id} style={styles.row}>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>
                {member.role === 'owner' ? strings.farm.roleOwner : strings.farm.roleWorker}
                {member.userId === user?.id ? ' (tú)' : ''}
              </Text>
              <Text style={styles.rowSubtitle}>
                {member.membershipStatus === 'active'
                  ? strings.status.active
                  : strings.farm.memberInactive}
              </Text>
            </View>
            {member.membershipStatus === 'active' && member.userId !== user?.id ? (
              <AppButton
                title={strings.farm.deactivateMember}
                variant="danger"
                onPress={() => deactivate(member.id, member.userId)}
              />
            ) : null}
          </View>
        ))}

        <Text style={styles.sectionTitle}>{strings.farm.invitations}</Text>
        {(data?.invites ?? []).length === 0 ? (
          <EmptyState title={strings.farm.pendingInvites} subtitle="—" />
        ) : (
          (data?.invites ?? []).map((invite) => (
            <View key={invite.id} style={styles.row}>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{invite.normalizedEmail}</Text>
                <Text style={styles.rowSubtitle}>
                  {invite.role === 'owner' ? strings.farm.roleOwner : strings.farm.roleWorker} ·{' '}
                  {invite.status}
                </Text>
              </View>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>{strings.farm.invite}</Text>
        <TextField
          label={strings.farm.inviteEmail}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <SegmentedControl<FarmRole>
          options={[
            { value: 'worker', label: strings.farm.roleWorker },
            { value: 'owner', label: strings.farm.roleOwner },
          ]}
          value={inviteRole}
          onChange={setInviteRole}
        />
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <AppButton
          title={strings.farm.invite}
          onPress={() => void sendInvite()}
          loading={busy}
          disabled={email.trim() === ''}
          style={styles.inviteButton}
        />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.textPrimary,
    marginTop: spacing.lg,
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
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  rowSubtitle: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  error: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.danger,
    marginTop: spacing.md,
  },
  inviteButton: {
    marginTop: spacing.md,
  },
});
