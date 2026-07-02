import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing } from '@/lib/theme/tokens';

interface Props {
  title: string;
  subtitle?: string;
}

export function EmptyState({ title, subtitle }: Props) {
  return (
    <View style={styles.box}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.xl,
    marginVertical: spacing.md,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
