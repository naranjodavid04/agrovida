import type { SqlDriver } from '@/db/driver';
import { nowIso } from '@/lib/clock';

/**
 * Per-farm sync bookkeeping (ARCHITECTURE §4). One pull cursor per farm
 * (D-014); it only advances after pulled rows are applied transactionally.
 */

const PULL_SCOPE = 'pull';

interface SyncStateRow {
  farm_id: string;
  scope: string;
  last_server_version: number;
  last_success_at: string | null;
  last_error: string | null;
}

export function getPullCursor(driver: SqlDriver, farmId: string): number {
  const row = driver.get<SyncStateRow>('SELECT * FROM sync_state WHERE farm_id = ? AND scope = ?', [
    farmId,
    PULL_SCOPE,
  ]);
  return row?.last_server_version ?? 0;
}

/** Must run inside the same transaction that applied the pulled rows. */
export function setPullCursor(driver: SqlDriver, farmId: string, version: number): void {
  driver.run(
    `INSERT INTO sync_state (farm_id, scope, last_server_version, last_success_at, last_error)
     VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT (farm_id, scope) DO UPDATE SET
       last_server_version = excluded.last_server_version,
       last_success_at = excluded.last_success_at,
       last_error = NULL`,
    [farmId, PULL_SCOPE, version, nowIso()],
  );
}

export function recordSyncError(driver: SqlDriver, farmId: string, error: string): void {
  driver.run(
    `INSERT INTO sync_state (farm_id, scope, last_server_version, last_error)
     VALUES (?, ?, 0, ?)
     ON CONFLICT (farm_id, scope) DO UPDATE SET last_error = excluded.last_error`,
    [farmId, PULL_SCOPE, error.slice(0, 500)],
  );
}

export function getSyncInfo(
  driver: SqlDriver,
  farmId: string,
): { lastSuccessAt: string | null; lastError: string | null; cursor: number } {
  const row = driver.get<SyncStateRow>('SELECT * FROM sync_state WHERE farm_id = ? AND scope = ?', [
    farmId,
    PULL_SCOPE,
  ]);
  return {
    lastSuccessAt: row?.last_success_at ?? null,
    lastError: row?.last_error ?? null,
    cursor: row?.last_server_version ?? 0,
  };
}
