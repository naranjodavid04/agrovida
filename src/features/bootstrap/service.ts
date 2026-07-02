import type { SupabaseClient } from '@supabase/supabase-js';

import type { SqlDriver } from '@/db/driver';
import { createLogger } from '@/lib/logger';
import { APP_STATE_KEYS, deleteAppState, getAppState, setAppState } from '@/repositories/appState';
import {
  applyRemoteFarm,
  applyRemoteInvite,
  applyRemoteMember,
  getMembership,
  listFarmsForUser,
} from '@/repositories/farms';
import type { Farm, FarmRole } from '@/types/domain';

/**
 * Farm bootstrap (ARCHITECTURE §7): after an online login, the authorized
 * farms, memberships, and invites are cached in SQLite so offline restarts
 * restore the full context without network.
 */

const log = createLogger('bootstrap');

export interface AuthUser {
  id: string;
  email: string | null;
}

type RemoteRow = Record<string, unknown>;

function normalizeEmail(email: string | null): string {
  return (email ?? '').trim().toLowerCase();
}

/** Fetches and caches everything the user can see. Requires connectivity. */
export async function bootstrapFromRemote(
  driver: SqlDriver,
  client: SupabaseClient,
  user: AuthUser,
): Promise<void> {
  const [farms, members, invites] = await Promise.all([
    client.from('farms').select('*'),
    client.from('farm_members').select('*'),
    client.from('farm_invites').select('*').eq('normalized_email', normalizeEmail(user.email)),
  ]);
  if (farms.error) throw farms.error;
  if (members.error) throw members.error;
  if (invites.error) throw invites.error;

  driver.transaction(() => {
    for (const farm of (farms.data ?? []) as RemoteRow[]) applyRemoteFarm(driver, farm);
    for (const member of (members.data ?? []) as RemoteRow[]) applyRemoteMember(driver, member);
    for (const invite of (invites.data ?? []) as RemoteRow[]) applyRemoteInvite(driver, invite);
    setAppState(driver, APP_STATE_KEYS.cachedUser, JSON.stringify(user));
  });
  log.info('bootstrap cached', {
    farms: farms.data?.length ?? 0,
    members: members.data?.length ?? 0,
    invites: invites.data?.length ?? 0,
  });
}

/** Restores identity and farms from the local cache (offline restart). */
export function restoreFromCache(driver: SqlDriver): {
  user: AuthUser | null;
  farms: Farm[];
  activeFarmId: string | null;
} {
  const rawUser = getAppState(driver, APP_STATE_KEYS.cachedUser);
  if (!rawUser) return { user: null, farms: [], activeFarmId: null };
  let user: AuthUser;
  try {
    user = JSON.parse(rawUser) as AuthUser;
  } catch {
    return { user: null, farms: [], activeFarmId: null };
  }
  const farms = listFarmsForUser(driver, user.id);
  const storedActive = getAppState(driver, APP_STATE_KEYS.activeFarmId);
  const activeFarmId = farms.some((f) => f.id === storedActive) ? storedActive : null;
  return { user, farms, activeFarmId };
}

export function setActiveFarm(driver: SqlDriver, farmId: string | null): void {
  if (farmId === null) deleteAppState(driver, APP_STATE_KEYS.activeFarmId);
  else setAppState(driver, APP_STATE_KEYS.activeFarmId, farmId);
}

export function roleForFarm(driver: SqlDriver, farmId: string, userId: string): FarmRole | null {
  const membership = getMembership(driver, farmId, userId);
  return membership?.membershipStatus === 'active' ? membership.role : null;
}

/** Creates a farm online; the backend trigger adds the owner membership. */
export async function createFarm(
  driver: SqlDriver,
  client: SupabaseClient,
  name: string,
  user: AuthUser,
): Promise<Farm> {
  const inserted = await client
    .from('farms')
    .insert({ name: name.trim(), created_by: user.id })
    .select()
    .single();
  if (inserted.error) throw inserted.error;
  const farmRow = inserted.data as RemoteRow;

  const membership = await client
    .from('farm_members')
    .select('*')
    .eq('farm_id', String(farmRow.id))
    .eq('user_id', user.id)
    .single();
  if (membership.error) throw membership.error;

  driver.transaction(() => {
    applyRemoteFarm(driver, farmRow);
    applyRemoteMember(driver, membership.data as RemoteRow);
  });
  return {
    id: String(farmRow.id),
    name: String(farmRow.name),
    createdBy: String(farmRow.created_by),
    createdAt: String(farmRow.created_at),
  };
}

/** Accepts an invitation via the reviewed SECURITY DEFINER function. */
export async function acceptInvite(
  driver: SqlDriver,
  client: SupabaseClient,
  inviteId: string,
  user: AuthUser,
): Promise<void> {
  const result = await client.rpc('accept_farm_invite', { p_invite_id: inviteId });
  if (result.error) throw result.error;
  await bootstrapFromRemote(driver, client, user);
}

/** Owner action: creates an invitation (online). */
export async function inviteMember(
  driver: SqlDriver,
  client: SupabaseClient,
  farmId: string,
  email: string,
  role: FarmRole,
  user: AuthUser,
): Promise<void> {
  const inserted = await client
    .from('farm_invites')
    .insert({
      farm_id: farmId,
      normalized_email: normalizeEmail(email),
      role,
      created_by: user.id,
    })
    .select()
    .single();
  if (inserted.error) throw inserted.error;
  applyRemoteInvite(driver, inserted.data as RemoteRow);
}

/** Owner action: deactivates a membership (online). */
export async function deactivateMember(
  driver: SqlDriver,
  client: SupabaseClient,
  memberId: string,
): Promise<void> {
  const updated = await client
    .from('farm_members')
    .update({ membership_status: 'inactive' })
    .eq('id', memberId)
    .select()
    .single();
  if (updated.error) throw updated.error;
  applyRemoteMember(driver, updated.data as RemoteRow);
}
