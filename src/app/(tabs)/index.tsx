import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
  type AnimatedRef,
  useAnimatedRef,
} from 'react-native-reanimated';

import { EmptyState } from '@/components/EmptyState';
import { ScreenContainer } from '@/components/ScreenContainer';
import { SyncBadge } from '@/components/SyncBadge';
import { useAuth } from '@/features/auth/AuthProvider';
import { CowCard } from '@/features/herd/CowCard';
import { loadCowCards, type CowCardData } from '@/features/herd/queries';
import { useLocalQuery } from '@/features/herd/useLocalQuery';
import { strings } from '@/lib/i18n/strings';
import { colors, fonts, spacing, touchTarget } from '@/lib/theme/tokens';

/**
 * Screen 6 — main cow-card carousel (Design A). One cow per viewport,
 * clamped paging via Reanimated scroll, dots + textual position, and
 * accessible previous/next actions that do not require swiping.
 */
export default function CardsScreen() {
  const { activeFarmId } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const scrollX = useSharedValue(0);
  const listRef: AnimatedRef<Animated.FlatList<CowCardData>> = useAnimatedRef();
  const pageWidth = width - spacing.lg * 2;

  const query = useCallback(
    (driver: Parameters<typeof loadCowCards>[0]) =>
      activeFarmId ? loadCowCards(driver, activeFarmId) : [],
    [activeFarmId],
  );
  const { data } = useLocalQuery(query);
  const cards = data ?? [];

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  const goTo = (target: number) => {
    const clamped = Math.max(0, Math.min(cards.length - 1, target));
    listRef.current?.scrollToOffset({ offset: clamped * pageWidth, animated: true });
    setIndex(clamped);
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>A</Text>
          </View>
          <View>
            <Text style={styles.brand}>{strings.common.appName}</Text>
            <Text style={styles.tagline}>{strings.common.tagline}</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <SyncBadge />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.settings.title}
            onPress={() => router.push('/settings')}
            style={styles.settingsButton}
          >
            <Ionicons name="settings-outline" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>

      {cards.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState title={strings.herd.noCows} subtitle={strings.farm.createFirstFarm} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.herd.addCow}
            onPress={() => router.push('/cow/new')}
            style={styles.addButton}
          >
            <Text style={styles.addButtonText}>{strings.herd.addCow}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Animated.FlatList
            ref={listRef}
            data={cards}
            keyExtractor={(item) => item.cow.id}
            horizontal
            pagingEnabled
            snapToInterval={pageWidth}
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            onScroll={scrollHandler}
            onMomentumScrollEnd={(event) => {
              const next = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
              setIndex(Math.max(0, Math.min(cards.length - 1, next)));
            }}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={{ width: pageWidth }}>
                <View style={styles.cardPad}>
                  <CowCard data={item} />
                </View>
              </View>
            )}
          />
          <View style={styles.pagination}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.a11y.previousCow}
              onPress={() => goTo(index - 1)}
              style={styles.navButton}
            >
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
            </Pressable>
            <Text style={styles.position} accessibilityLiveRegion="polite">
              {Math.min(index + 1, cards.length)} / {cards.length}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.a11y.nextCow}
              onPress={() => goTo(index + 1)}
              style={styles.navButton}
            >
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </Pressable>
          </View>
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  settingsButton: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBox: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.onPrimary,
  },
  brand: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  tagline: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.textSecondary,
  },
  emptyWrap: {
    paddingHorizontal: spacing.lg,
  },
  addButton: {
    minHeight: touchTarget.field,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  addButtonText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.onPrimary,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
  },
  cardPad: {
    paddingHorizontal: 3,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.lg,
  },
  navButton: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    borderWidth: 1,
    borderColor: colors.borderInput,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  position: {
    fontFamily: fonts.numericSemiBold,
    fontSize: 14,
    color: colors.textMuted,
    minWidth: 52,
    textAlign: 'center',
  },
});
