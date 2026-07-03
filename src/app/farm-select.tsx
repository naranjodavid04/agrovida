import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenContainer } from '@/components/ScreenContainer';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/features/auth/AuthProvider';
import { authErrorMessage } from '@/features/auth/errors';
import { strings } from '@/lib/i18n/strings';
import { colors, fonts, radius, spacing, touchTarget } from '@/lib/theme/tokens';

/**
 * Screens 4 y 5 — create/select farm and pending invitations. Also the
 * "switch farm" screen for users who belong to several farms (e.g. a worker
 * who owns their own farm), so it renders in the `ready` state too and
 * navigates explicitly after choosing. Selection works offline from the
 * cache; creating a farm or accepting an invitation needs connectivity.
 */
export default function FarmSelectScreen() {
  const {
    status,
    farms,
    activeFarmId,
    pendingInvites,
    selectFarm,
    createNewFarm,
    acceptFarmInvite,
    signOut,
  } = useAuth();
  const router = useRouter();
  const [farmName, setFarmName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'signedOut') return <Redirect href="/login" />;
  const switching = status === 'ready';

  const choose = (farmId: string) => {
    selectFarm(farmId);
    router.replace('/(tabs)');
  };

  const create = async () => {
    setError(null);
    setBusy(true);
    try {
      await createNewFarm(farmName);
      router.replace('/(tabs)');
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const accept = async (inviteId: string) => {
    setError(null);
    setBusy(true);
    try {
      await acceptFarmInvite(inviteId);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenContainer scroll>
      {switching ? (
        <ScreenHeader title={strings.farm.switchFarm} />
      ) : (
        <Text style={styles.title}>{strings.farm.selectFarm}</Text>
      )}
      <OfflineBanner />

      {farms.length === 0 && pendingInvites.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>{strings.farm.noFarms}</Text>
          <Text style={styles.emptySubtitle}>{strings.farm.createFirstFarm}</Text>
        </View>
      ) : null}

      {farms.length > 0 ? (
        <FlatList
          data={farms}
          scrollEnabled={false}
          keyExtractor={(farm) => farm.id}
          renderItem={({ item }) => {
            const isActive = item.id === activeFarmId;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${strings.farm.selectFarm}: ${item.name}`}
                accessibilityState={{ selected: isActive }}
                style={({ pressed }) => [styles.farmRow, pressed && styles.pressed]}
                onPress={() => choose(item.id)}
              >
                <Text style={styles.farmName}>{item.name}</Text>
                {isActive ? (
                  <Text style={styles.activeTag}>{strings.settings.activeFarm}</Text>
                ) : null}
              </Pressable>
            );
          }}
        />
      ) : null}

      {pendingInvites.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{strings.farm.pendingInvites}</Text>
          {pendingInvites.map((invite) => (
            <View key={invite.id} style={styles.inviteRow}>
              <View style={styles.inviteInfo}>
                <Text style={styles.farmName}>
                  {invite.role === 'owner' ? strings.farm.roleOwner : strings.farm.roleWorker}
                </Text>
                <Text style={styles.inviteEmail}>{invite.normalizedEmail}</Text>
              </View>
              <AppButton
                title={strings.farm.acceptInvite}
                onPress={() => accept(invite.id)}
                loading={busy}
              />
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{strings.farm.createFarm}</Text>
        <TextField
          label={strings.farm.farmName}
          value={farmName}
          onChangeText={setFarmName}
          autoCapitalize="words"
        />
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <AppButton
          title={strings.farm.createFarm}
          onPress={create}
          loading={busy}
          disabled={farmName.trim() === ''}
        />
      </View>

      {!switching ? (
        <AppButton
          title={strings.auth.logout}
          variant="secondary"
          onPress={() => void signOut({ force: true })}
          style={styles.logout}
        />
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 24,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  emptyBox: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  farmRow: {
    minHeight: touchTarget.field,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.listRow,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  pressed: {
    opacity: 0.85,
  },
  farmName: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  activeTag: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.primary,
    marginTop: 2,
  },
  section: {
    marginTop: spacing.xxl,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  inviteRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.listRow,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  inviteInfo: {
    gap: spacing.xs,
  },
  inviteEmail: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textMuted,
  },
  error: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  logout: {
    marginTop: spacing.xxxl,
    marginBottom: spacing.xl,
  },
});
