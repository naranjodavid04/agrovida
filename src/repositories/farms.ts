import type { SqlDriver } from '@/db/driver';
import { nowIso } from '@/lib/clock';
import type { Farm, FarmInvite, FarmMember } from '@/types/domain';

/**
 * Local cache of farms, memberships, and invites. These rows originate on
 * the server (farm creation and invite acceptance require connectivity per
 * PRODUCT_SPEC §3), so writes here apply remote state without outbox entries.
 */

interface FarmRow {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  server_version: number;
}

interface MemberRow {
  id: string;
  farm_id: string;
  user_id: string;
  role: FarmMember['role'];
  membership_status: FarmMember['membershipStatus'];
  created_at: string;
  server_version: number;
}

interface InviteRow {
  id: string;
  farm_id: string;
  normalized_email: string;
  role: FarmInvite['role'];
  status: FarmInvite['status'];
  expires_at: string;
  created_by: string;
  created_at: string;
  server_version: number;
}

export function applyRemoteFarm(driver: SqlDriver, remote: Record<string, unknown>): void {
  driver.run(
    `INSERT OR REPLACE INTO farms (id, name, created_by, created_at, server_version)
     VALUES (?, ?, ?, ?, ?)`,
    [
      String(remote.id),
      String(remote.name),
      String(remote.created_by),
      String(remote.created_at),
      Number(remote.server_version ?? 0),
    ],
  );
}

export function applyRemoteMember(driver: SqlDriver, remote: Record<string, unknown>): void {
  driver.run(
    `INSERT OR REPLACE INTO farm_members
       (id, farm_id, user_id, role, membership_status, created_at, server_version)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      String(remote.id),
      String(remote.farm_id),
      String(remote.user_id),
      String(remote.role),
      String(remote.membership_status),
      String(remote.created_at),
      Number(remote.server_version ?? 0),
    ],
  );
}

export function applyRemoteInvite(driver: SqlDriver, remote: Record<string, unknown>): void {
  driver.run(
    `INSERT OR REPLACE INTO farm_invites
       (id, farm_id, normalized_email, role, status, expires_at, created_by, created_at, server_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(remote.id),
      String(remote.farm_id),
      String(remote.normalized_email),
      String(remote.role),
      String(remote.status),
      String(remote.expires_at ?? nowIso()),
      String(remote.created_by),
      String(remote.created_at),
      Number(remote.server_version ?? 0),
    ],
  );
}

export function getFarm(driver: SqlDriver, farmId: string): Farm | null {
  const row = driver.get<FarmRow>('SELECT * FROM farms WHERE id = ?', [farmId]);
  if (!row) return null;
  return { id: row.id, name: row.name, createdBy: row.created_by, createdAt: row.created_at };
}

export function listFarmsForUser(driver: SqlDriver, userId: string): Farm[] {
  return driver
    .all<FarmRow>(
      `SELECT f.* FROM farms f
       JOIN farm_members m ON m.farm_id = f.id
       WHERE m.user_id = ? AND m.membership_status = 'active'
       ORDER BY f.name COLLATE NOCASE`,
      [userId],
    )
    .map((row) => ({
      id: row.id,
      name: row.name,
      createdBy: row.created_by,
      createdAt: row.created_at,
    }));
}

export function getMembership(
  driver: SqlDriver,
  farmId: string,
  userId: string,
): FarmMember | null {
  const row = driver.get<MemberRow>(
    'SELECT * FROM farm_members WHERE farm_id = ? AND user_id = ?',
    [farmId, userId],
  );
  if (!row) return null;
  return {
    id: row.id,
    farmId: row.farm_id,
    userId: row.user_id,
    role: row.role,
    membershipStatus: row.membership_status,
    createdAt: row.created_at,
  };
}

export function listMembers(driver: SqlDriver, farmId: string): FarmMember[] {
  return driver
    .all<MemberRow>('SELECT * FROM farm_members WHERE farm_id = ? ORDER BY created_at', [farmId])
    .map((row) => ({
      id: row.id,
      farmId: row.farm_id,
      userId: row.user_id,
      role: row.role,
      membershipStatus: row.membership_status,
      createdAt: row.created_at,
    }));
}

export function listInvites(driver: SqlDriver, farmId: string): FarmInvite[] {
  return driver
    .all<InviteRow>(`SELECT * FROM farm_invites WHERE farm_id = ? ORDER BY created_at DESC`, [
      farmId,
    ])
    .map((row) => ({
      id: row.id,
      farmId: row.farm_id,
      normalizedEmail: row.normalized_email,
      role: row.role,
      status: row.status,
      expiresAt: row.expires_at,
      createdBy: row.created_by,
      createdAt: row.created_at,
    }));
}
