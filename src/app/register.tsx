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

const MIN_PASSWORD_LENGTH = 8;

/** Screen 3 — registration. */
export default function RegisterScreen() {
  const { status, signUp, remoteConfigured } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'ready') return <Redirect href="/(tabs)" />;
  if (status === 'needsFarm') return <Redirect href="/farm-select" />;

  const submit = async () => {
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(strings.auth.passwordTooShort);
      return;
    }
    if (password !== confirm) {
      setError(strings.auth.passwordsDontMatch);
      return;
    }
    setBusy(true);
    try {
      const result = await signUp(email, password);
      if (result.kind === 'needs_confirmation') {
        setNotice('Revisa tu correo para confirmar la cuenta y luego inicia sesión.');
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenContainer scroll>
      <View style={styles.header}>
        <Text style={styles.title}>{strings.auth.register}</Text>
      </View>
      <OfflineBanner />
      <TextField
        label={strings.auth.email}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <TextField
        label={strings.auth.password}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
      />
      <TextField
        label={strings.auth.passwordConfirm}
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {notice ? (
        <Text style={styles.notice} accessibilityRole="alert">
          {notice}
        </Text>
      ) : null}
      <AppButton
        title={strings.auth.register}
        onPress={submit}
        loading={busy}
        disabled={!remoteConfigured || email.trim() === '' || password === ''}
      />
      <Link href="/login" style={styles.link}>
        {strings.auth.haveAccount}
      </Link>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginTop: spacing.xxl,
    marginBottom: spacing.xl,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 24,
    color: colors.textPrimary,
  },
  error: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  notice: {
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.primary,
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
