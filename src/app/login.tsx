import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenContainer } from '@/components/ScreenContainer';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/features/auth/AuthProvider';
import { authErrorMessage } from '@/features/auth/errors';
import { strings } from '@/lib/i18n/strings';
import { colors, fonts, spacing } from '@/lib/theme/tokens';

/** Screen 2 — login (first login requires connectivity, PRODUCT_SPEC §3). */
export default function LoginScreen() {
  const { status, signIn, remoteConfigured } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'ready') return <Redirect href="/(tabs)" />;
  if (status === 'needsFarm') return <Redirect href="/farm-select" />;

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenContainer scroll>
      <View style={styles.header}>
        <Text style={styles.title}>{strings.common.appName}</Text>
        <Text style={styles.subtitle}>{strings.common.tagline}</Text>
      </View>
      <OfflineBanner />
      {!remoteConfigured ? (
        <Text style={styles.configWarning} accessibilityRole="alert">
          Falta configurar el servidor (.env). Copia .env.example y completa los valores.
        </Text>
      ) : null}
      <TextField
        label={strings.auth.email}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <TextField
        label={strings.auth.password}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        textContentType="password"
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <AppButton
        title={strings.auth.login}
        onPress={submit}
        loading={busy}
        disabled={!remoteConfigured || email.trim() === '' || password === ''}
      />
      <Link href="/register" style={styles.link}>
        {strings.auth.noAccount}
      </Link>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginTop: spacing.xxxl,
    marginBottom: spacing.xxl,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 30,
    color: colors.textPrimary,
  },
  subtitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  configWarning: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.danger,
    marginBottom: spacing.lg,
  },
  error: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  link: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.primary,
    textAlign: 'center',
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
  },
});
