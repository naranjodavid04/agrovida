import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/AuthProvider';
import { strings } from '@/lib/i18n/strings';
import { colors, fonts, spacing } from '@/lib/theme/tokens';

/** Screen 1 — bootstrap/loading: restores session and routes accordingly. */
export default function BootstrapScreen() {
  const { status } = useAuth();

  if (status === 'signedOut') return <Redirect href="/login" />;
  if (status === 'needsFarm') return <Redirect href="/farm-select" />;
  if (status === 'ready') return <Redirect href="/home" />;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{strings.common.appName}</Text>
        <Text style={styles.subtitle}>{strings.common.tagline}</Text>
        <ActivityIndicator color={colors.primary} style={styles.spinner} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.appBackground,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 28,
    color: colors.textPrimary,
  },
  subtitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textSecondary,
  },
  spinner: {
    marginTop: spacing.lg,
  },
});
