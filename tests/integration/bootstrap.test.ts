import type { SupabaseClient } from '@supabase/supabase-js';

import type { SqlDriver } from '@/db/driver';
import { clearLocalData } from '@/db/maintenance';
import {
  acceptInvite,
  bootstrapFromRemote,
  createFarm,
  restoreFromCache,
  roleForFarm,
  setActiveFarm,
} from '@/features/bootstrap/service';
import { hasPendingLocalChanges } from '@/features/auth/session';
import { listMembers, listPendingInvitesForEmail } from '@/repositories/farms';
import { enqueueMutation } from '@/sync/outbox';

import { createMigratedTestDb } from '../helpers/testDb';

const USER = { id: 'user-1', email: 'Dueno@Test.Local' };

const FARM_ROW = {
  id: 'farm-1',
  name: 'Finca Remota',
  created_by: 'user-1',
  created_at: '2026-07-01T00:00:00Z',
  server_updated_at: '2026-07-01T00:00:00Z',
  server_version: 1,
};

const MEMBER_ROW = {
  id: 'member-1',
  farm_id: 'farm-1',
  user_id: 'user-1',
  role: 'owner',
  membership_status: 'active',
  created_at: '2026-07-01T00:00:00Z',
  server_version: 2,
};

const INVITE_ROW = {
  id: 'invite-1',
  farm_id: 'farm-2',
  normalized_email: 'dueno@test.local',
  role: 'worker',
  status: 'pending',
  expires_at: '2026-08-01T00:00:00Z',
  created_by: 'user-9',
  created_at: '2026-07-01T00:00:00Z',
  server_version: 3,
};

/** Read-only client covering the chains bootstrapFromRemote uses. */
function readClient(rows: {
  farms?: unknown[];
  members?: unknown[];
  invites?: unknown[];
}): SupabaseClient {
  return {
    from: (table: string) => ({
      select: () => {
        const data =
          table === 'farms'
            ? (rows.farms ?? [])
            : table === 'farm_members'
              ? (rows.members ?? [])
              : [];
        const thenable = Promise.resolve({ data, error: null });
        return Object.assign(thenable, {
          eq: () => Promise.resolve({ data: rows.invites ?? [], error: null }),
        });
      },
    }),
  } as unknown as SupabaseClient;
}

describe('farm bootstrap', () => {
  let driver: SqlDriver;

  beforeEach(() => {
    driver = createMigratedTestDb();
  });

  afterEach(() => driver.close());

  it('caches farms, memberships, invites, and the user for offline restarts', async () => {
    await bootstrapFromRemote(
      driver,
      readClient({ farms: [FARM_ROW], members: [MEMBER_ROW], invites: [INVITE_ROW] }),
      USER,
    );

    const cache = restoreFromCache(driver);
    expect(cache.user).toEqual(USER);
    expect(cache.farms.map((f) => f.id)).toEqual(['farm-1']);
    expect(cache.activeFarmId).toBeNull();

    expect(roleForFarm(driver, 'farm-1', 'user-1')).toBe('owner');
    expect(listMembers(driver, 'farm-1')).toHaveLength(1);
    // Invitation lookup is case-insensitive on the user email.
    expect(listPendingInvitesForEmail(driver, USER.email)).toHaveLength(1);
  });

  it('persists the active farm across restarts and validates it', () => {
    driver.run(
      `INSERT INTO farms (id, name, created_by, created_at, server_version)
       VALUES ('farm-1', 'Finca', 'user-1', '2026-07-01', 1)`,
    );
    driver.run(
      `INSERT INTO farm_members (id, farm_id, user_id, role, membership_status, created_at, server_version)
       VALUES ('m1', 'farm-1', 'user-1', 'worker', 'active', '2026-07-01', 2)`,
    );
    driver.run(`INSERT INTO app_state (key, value) VALUES ('cached_user', ?)`, [
      JSON.stringify(USER),
    ]);

    setActiveFarm(driver, 'farm-1');
    expect(restoreFromCache(driver).activeFarmId).toBe('farm-1');

    // A stored farm the user no longer belongs to is ignored.
    setActiveFarm(driver, 'farm-ghost');
    expect(restoreFromCache(driver).activeFarmId).toBeNull();
  });

  it('does not grant a role for inactive memberships', () => {
    driver.run(
      `INSERT INTO farm_members (id, farm_id, user_id, role, membership_status, created_at, server_version)
       VALUES ('m1', 'farm-1', 'user-1', 'worker', 'inactive', '2026-07-01', 2)`,
    );
    expect(roleForFarm(driver, 'farm-1', 'user-1')).toBeNull();
  });

  it('createFarm applies the remote farm and its owner membership locally', async () => {
    const client = {
      from: (table: string) => {
        if (table === 'farms') {
          return {
            insert: () => ({
              select: () => ({ single: async () => ({ data: FARM_ROW, error: null }) }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ single: async () => ({ data: MEMBER_ROW, error: null }) }),
            }),
          }),
        };
      },
    } as unknown as SupabaseClient;

    const farm = await createFarm(driver, client, '  Finca Remota ', USER);
    expect(farm.id).toBe('farm-1');
    expect(restoreFromCache(driver).user).toBeNull(); // cached_user is set by bootstrap, not createFarm
    expect(roleForFarm(driver, 'farm-1', 'user-1')).toBe('owner');
  });

  it('acceptInvite calls the reviewed RPC and refreshes the cache', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: 'member-2', error: null });
    const base = readClient({ farms: [FARM_ROW], members: [MEMBER_ROW], invites: [] });
    const client = Object.assign(base, { rpc }) as SupabaseClient;

    await acceptInvite(driver, client, 'invite-1', USER);
    expect(rpc).toHaveBeenCalledWith('accept_farm_invite', { p_invite_id: 'invite-1' });
    expect(restoreFromCache(driver).farms).toHaveLength(1);
  });

  it('logout guard flags pending outbox entries; clearing wipes all rows (D-015)', () => {
    expect(hasPendingLocalChanges(driver)).toBe(false);
    enqueueMutation(driver, {
      farmId: 'farm-1',
      entityType: 'cow',
      entityId: 'cow-1',
      operation: 'upsert',
      payload: {},
    });
    expect(hasPendingLocalChanges(driver)).toBe(true);

    driver.run(
      `INSERT INTO farms (id, name, created_by, created_at, server_version)
       VALUES ('farm-1', 'Finca', 'user-1', '2026-07-01', 1)`,
    );
    clearLocalData(driver);
    expect(hasPendingLocalChanges(driver)).toBe(false);
    expect(driver.all('SELECT * FROM farms')).toHaveLength(0);
    expect(restoreFromCache(driver).user).toBeNull();
  });
});
