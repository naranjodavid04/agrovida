import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { strings } from '@/lib/i18n/strings';
import { colors, fonts, radius, spacing, touchTarget } from '@/lib/theme/tokens';

interface Props {
  title: string;
  right?: ReactNode;
}

/** Secondary-route header with back button and optional right action. */
export function ScreenHeader({ title, right }: Props) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.common.back}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      >
        <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  back: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  pressed: {
    opacity: 0.8,
  },
  title: {
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: 20,
    color: colors.textPrimary,
  },
  right: {
    minWidth: touchTarget.min,
    alignItems: 'flex-end',
  },
});
