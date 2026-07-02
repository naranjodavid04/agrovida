import type { SupabaseClient } from '@supabase/supabase-js';

import type { SqlDriver } from '@/db/driver';
import { clearLocalData } from '@/db/maintenance';
import { createLogger } from '@/lib/logger';
import { countAllPendingMutations } from '@/sync/outbox';

import type { AuthUser } from '../bootstrap/service';

/**
 * Session use cases. First login requires connectivity (PRODUCT_SPEC §3);
 * afterwards the persisted session and the SQLite cache keep the app usable
 * offline, even past token expiry (sync waits for a successful refresh).
 */

const log = createLogger('auth');

export type SignUpResult = { kind: 'signed_in'; user: AuthUser } | { kind: 'needs_confirmation' };

function toAuthUser(user: { id: string; email?: string | null }): AuthUser {
  return { id: user.id, email: user.email ?? null };
}

export async function signInWithPassword(
  client: SupabaseClient,
  email: string,
  password: string,
): Promise<AuthUser> {
  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  if (!data.user) throw new Error('sign-in returned no user');
  return toAuthUser(data.user);
}

export async function signUpWithPassword(
  client: SupabaseClient,
  email: string,
  password: string,
): Promise<SignUpResult> {
  const { data, error } = await client.auth.signUp({ email: email.trim(), password });
  if (error) throw error;
  if (data.session && data.user) return { kind: 'signed_in', user: toAuthUser(data.user) };
  // Email confirmation enabled on the project: the user must confirm first.
  return { kind: 'needs_confirmation' };
}

/** Session user as persisted locally; no network round-trip. */
export async function getStoredSessionUser(client: SupabaseClient): Promise<AuthUser | null> {
  const { data } = await client.auth.getSession();
  const user = data.session?.user;
  return user ? toAuthUser(user) : null;
}

/** D-015: logout with pending mutations requires explicit confirmation. */
export function hasPendingLocalChanges(driver: SqlDriver): boolean {
  return countAllPendingMutations(driver) > 0;
}

/**
 * Confirmed logout: revokes the local session (works offline) and wipes
 * local farm data (D-015). Remote revocation is best-effort.
 */
export async function signOutAndClear(driver: SqlDriver, client: SupabaseClient): Promise<void> {
  try {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) log.warn('signOut error (continuing with local clear)', { message: error.message });
  } catch (error) {
    log.warn('signOut threw (continuing with local clear)', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
  clearLocalData(driver);
  log.info('local data cleared on logout');
}
