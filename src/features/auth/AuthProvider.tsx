import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { getDatabase } from '@/db/database';
import { hasRemoteConfig } from '@/lib/env';
import { createLogger } from '@/lib/logger';
import { getSupabase } from '@/lib/supabase';
import { listPendingInvitesForEmail } from '@/repositories/farms';
import type { Farm, FarmInvite, FarmRole } from '@/types/domain';

import {
  acceptInvite,
  bootstrapFromRemote,
  createFarm,
  restoreFromCache,
  roleForFarm,
  setActiveFarm,
  type AuthUser,
} from '../bootstrap/service';
import {
  getStoredSessionUser,
  hasPendingLocalChanges,
  signInWithPassword,
  signOutAndClear,
  signUpWithPassword,
  type SignUpResult,
} from './session';

/**
 * Session state machine (Phase 4 states, PRODUCT_SPEC §3):
 * - loading: opening the database and restoring the session
 * - signedOut: no session and no cached identity
 * - needsFarm: signed in but no active farm selected
 * - ready: signed in with an active farm
 * `sessionExpired` marks offline continuation after token expiry: local work
 * proceeds; sync waits for a successful refresh (ARCHITECTURE §7).
 */

const log = createLogger('auth:provider');

export type AuthStatus = 'loading' | 'signedOut' | 'needsFarm' | 'ready';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  farms: Farm[];
  pendingInvites: FarmInvite[];
  activeFarmId: string | null;
  role: FarmRole | null;
  sessionExpired: boolean;
  remoteConfigured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: (options?: { force?: boolean }) => Promise<'pending_changes' | 'done'>;
  selectFarm: (farmId: string) => void;
  createNewFarm: (name: string) => Promise<void>;
  acceptFarmInvite: (inviteId: string) => Promise<void>;
  refreshBootstrap: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface State {
  status: AuthStatus;
  user: AuthUser | null;
  farms: Farm[];
  pendingInvites: FarmInvite[];
  activeFarmId: string | null;
  role: FarmRole | null;
  sessionExpired: boolean;
}

const initialState: State = {
  status: 'loading',
  user: null,
  farms: [],
  pendingInvites: [],
  activeFarmId: null,
  role: null,
  sessionExpired: false,
};

function deriveState(user: AuthUser | null, sessionExpired: boolean): State {
  if (!user) return { ...initialState, status: 'signedOut' };
  const driver = getDatabase();
  const cache = restoreFromCache(driver);
  const farms = cache.farms;
  const activeFarmId = cache.activeFarmId;
  const role = activeFarmId ? roleForFarm(driver, activeFarmId, user.id) : null;
  const pendingInvites = user.email ? listPendingInvitesForEmail(driver, user.email) : [];
  return {
    status: activeFarmId && role ? 'ready' : 'needsFarm',
    user,
    farms,
    pendingInvites,
    activeFarmId: role ? activeFarmId : null,
    role,
    sessionExpired,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initialState);
  const remoteConfigured = hasRemoteConfig();

  const refreshFromLocal = useCallback((user: AuthUser | null, sessionExpired: boolean) => {
    setState(deriveState(user, sessionExpired));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const driver = getDatabase();
        let user: AuthUser | null = null;
        let sessionExpired = false;
        if (remoteConfigured) {
          user = await getStoredSessionUser(getSupabase());
        }
        if (!user) {
          // Offline continuation: fall back to the cached identity (§7).
          const cached = restoreFromCache(driver);
          user = cached.user;
          sessionExpired = user !== null;
        } else {
          // Best-effort refresh of the farm cache; offline is fine.
          try {
            await bootstrapFromRemote(driver, getSupabase(), user);
          } catch (error) {
            log.info('bootstrap refresh skipped (offline?)', {
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
        if (!cancelled) refreshFromLocal(user, sessionExpired);
      } catch (error) {
        log.error('session restore failed', {
          message: error instanceof Error ? error.message : String(error),
        });
        if (!cancelled) setState({ ...initialState, status: 'signedOut' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshFromLocal, remoteConfigured]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const client = getSupabase();
      const user = await signInWithPassword(client, email, password);
      await bootstrapFromRemote(getDatabase(), client, user);
      refreshFromLocal(user, false);
    },
    [refreshFromLocal],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      const client = getSupabase();
      const result = await signUpWithPassword(client, email, password);
      if (result.kind === 'signed_in') {
        await bootstrapFromRemote(getDatabase(), client, result.user);
        refreshFromLocal(result.user, false);
      }
      return result;
    },
    [refreshFromLocal],
  );

  const signOut = useCallback(async (options?: { force?: boolean }) => {
    const driver = getDatabase();
    if (!options?.force && hasPendingLocalChanges(driver)) {
      return 'pending_changes' as const;
    }
    await signOutAndClear(driver, getSupabase());
    setState({ ...initialState, status: 'signedOut' });
    return 'done' as const;
  }, []);

  const selectFarm = useCallback(
    (farmId: string) => {
      setActiveFarm(getDatabase(), farmId);
      refreshFromLocal(state.user, state.sessionExpired);
    },
    [refreshFromLocal, state.user, state.sessionExpired],
  );

  const createNewFarm = useCallback(
    async (name: string) => {
      if (!state.user) throw new Error('not signed in');
      const farm = await createFarm(getDatabase(), getSupabase(), name, state.user);
      setActiveFarm(getDatabase(), farm.id);
      refreshFromLocal(state.user, state.sessionExpired);
    },
    [refreshFromLocal, state.user, state.sessionExpired],
  );

  const acceptFarmInvite = useCallback(
    async (inviteId: string) => {
      if (!state.user) throw new Error('not signed in');
      await acceptInvite(getDatabase(), getSupabase(), inviteId, state.user);
      refreshFromLocal(state.user, state.sessionExpired);
    },
    [refreshFromLocal, state.user, state.sessionExpired],
  );

  const refreshBootstrap = useCallback(async () => {
    if (!state.user) return;
    await bootstrapFromRemote(getDatabase(), getSupabase(), state.user);
    refreshFromLocal(state.user, false);
  }, [refreshFromLocal, state.user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      remoteConfigured,
      signIn,
      signUp,
      signOut,
      selectFarm,
      createNewFarm,
      acceptFarmInvite,
      refreshBootstrap,
    }),
    [
      state,
      remoteConfigured,
      signIn,
      signUp,
      signOut,
      selectFarm,
      createNewFarm,
      acceptFarmInvite,
      refreshBootstrap,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
