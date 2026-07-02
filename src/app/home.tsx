import { Redirect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenContainer } from '@/components/ScreenContainer';
import { useAuth } from '@/features/auth/AuthProvider';
import { strings } from '@/lib/i18n/strings';
import { colors, fonts, spacing } from '@/lib/theme/tokens';

/**
 * Placeholder for the main experience. Phase 6 replaces this route with the
 * tab navigator (Inicio/Rebaño/Resumen) and the Design A carousel.
 */
export default function HomeScreen() {
  const { status, farms, activeFarmId, role } = useAuth();

  if (status === 'signedOut') return <Redirect href="/login" />;
  if (status === 'needsFarm') return <Redirect href="/farm-select" />;

  const farm = farms.find((f) => f.id === activeFarmId);

  return (
    <ScreenContainer>
      <OfflineBanner />
      <View style={styles.content}>
        <Text style={styles.title}>{farm?.name ?? strings.common.appName}</Text>
        <Text style={styles.subtitle}>
          {role === 'owner' ? strings.farm.roleOwner : strings.farm.roleWorker}
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 24,
    color: colors.textPrimary,
  },
  subtitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textSecondary,
  },
});
