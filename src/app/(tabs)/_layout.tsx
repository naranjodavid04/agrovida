import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { useAuth } from '@/features/auth/AuthProvider';
import { strings } from '@/lib/i18n/strings';
import { colors, fonts } from '@/lib/theme/tokens';

/** Bottom tabs: Inicio/Cartas, Rebaño, Resumen (DESIGN_SPEC §4). */
export default function TabsLayout() {
  const { status } = useAuth();
  if (status === 'signedOut') return <Redirect href="/login" />;
  if (status === 'needsFarm') return <Redirect href="/farm-select" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.borderSoft,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.bold,
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: strings.tabs.home,
          tabBarIcon: ({ color, size }) => <Ionicons name="albums" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="herd"
        options={{
          title: strings.tabs.herd,
          tabBarIcon: ({ color, size }) => <Ionicons name="list" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="summary"
        options={{
          title: strings.tabs.summary,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
