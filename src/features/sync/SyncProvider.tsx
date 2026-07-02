import NetInfo from '@react-native-community/netinfo';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { getDatabase } from '@/db/database';
import { useAuth } from '@/features/auth/AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { createSyncCoordinator, type SyncCoordinator, type SyncSnapshot } from '@/sync/coordinator';
import { createSupabasePhotoUploader } from '@/sync/photoUploader';
import { createSupabaseRemote } from '@/sync/remote';

/**
 * Wires the sync coordinator to its automatic triggers (PRODUCT_SPEC §3):
 * reconnect, app foreground, auth refresh, and manual retry from
 * diagnostics. Exposes the compact sync snapshot to the UI.
 */

interface SyncContextValue {
  snapshot: SyncSnapshot;
  retryNow: () => void;
  /** Call after a local write so the push starts immediately when online. */
  notifyLocalChange: () => void;
}

const idleSnapshot: SyncSnapshot = {
  status: 'idle',
  pendingCount: 0,
  openConflicts: 0,
  lastSuccessAt: null,
  lastError: null,
};

const SyncContext = createContext<SyncContextValue>({
  snapshot: idleSnapshot,
  retryNow: () => undefined,
  notifyLocalChange: () => undefined,
});

/** Retry cadence while there is pending work or a transient error. */
const RETRY_INTERVAL_MS = 30_000;

/**
 * Mutable runtime the coordinator reads outside the React render cycle
 * (connectivity and active farm change from event listeners).
 */
const runtime: { online: boolean; farmId: string | null } = {
  online: false,
  farmId: null,
};

function buildCoordinator(onSnapshot: (snapshot: SyncSnapshot) => void): SyncCoordinator {
  return createSyncCoordinator({
    getDriver: getDatabase,
    getRemote: () => createSupabaseRemote(getSupabase()),
    getFarmId: () => runtime.farmId,
    hasValidSession: async () => {
      const { data } = await getSupabase().auth.getSession();
      const expiresAt = data.session?.expires_at;
      return !!data.session && (!expiresAt || expiresAt * 1000 > Date.now());
    },
    isOnline: () => runtime.online,
    photoUploader: createSupabasePhotoUploader(getSupabase()),
    onSnapshot,
  });
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { status, activeFarmId, remoteConfigured } = useAuth();
  const [snapshot, setSnapshot] = useState<SyncSnapshot>(idleSnapshot);

  const coordinator = useMemo<SyncCoordinator | null>(
    () => (remoteConfigured ? buildCoordinator(setSnapshot) : null),
    [remoteConfigured],
  );

  useEffect(() => {
    runtime.farmId = activeFarmId;
  }, [activeFarmId]);

  // Trigger: reconnect.
  useEffect(() => {
    if (!coordinator) return;
    const unsubscribe = NetInfo.addEventListener((state) => {
      const wasOnline = runtime.online;
      runtime.online = state.isConnected === true && state.isInternetReachable !== false;
      if (!wasOnline && runtime.online) void coordinator.requestSync('reconnect');
    });
    return unsubscribe;
  }, [coordinator]);

  // Trigger: app foreground.
  useEffect(() => {
    if (!coordinator) return;
    const subscription = AppState.addEventListener('change', (appState) => {
      if (appState === 'active') void coordinator.requestSync('foreground');
    });
    return () => subscription.remove();
  }, [coordinator]);

  // Trigger: successful auth refresh (sync waits for a valid session).
  useEffect(() => {
    if (!coordinator) return;
    const { data } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        void coordinator.requestSync('auth-refresh');
      }
    });
    return () => data.subscription.unsubscribe();
  }, [coordinator]);

  // Initial sync when the farm becomes active + bounded retry loop. Snapshot
  // updates arrive through the coordinator's onSnapshot callback.
  useEffect(() => {
    if (!coordinator || status !== 'ready' || !activeFarmId) return;
    void coordinator.requestSync('farm-active');
    const interval = setInterval(() => {
      const current = coordinator.getSnapshot();
      if (current.pendingCount > 0 || current.status === 'error') {
        void coordinator.requestSync('retry-timer');
      }
    }, RETRY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [coordinator, status, activeFarmId]);

  const value = useMemo<SyncContextValue>(
    () => ({
      snapshot,
      retryNow: () => void coordinator?.requestSync('manual-retry'),
      notifyLocalChange: () => void coordinator?.requestSync('local-write'),
    }),
    [snapshot, coordinator],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  return useContext(SyncContext);
}
