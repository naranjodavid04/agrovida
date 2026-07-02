import type { SqlDriver } from '@/db/driver';
import { nowIso } from '@/lib/clock';

/**
 * Permanent sync conflicts surfaced in diagnostics (D-016). A rejected local
 * mutation is never dropped silently: it lands here for explicit resolution.
 */

export interface SyncConflict {
  id: number;
  farm_id: string;
  entity_type: string;
  entity_id: string;
  local_payload_json: string;
  server_payload_json: string | null;
  reason: string;
  created_at: string;
  resolved_at: string | null;
}

export interface ConflictInput {
  farmId: string;
  entityType: string;
  entityId: string;
  localPayload: Record<string, unknown>;
  serverPayload: Record<string, unknown> | null;
  reason: string;
}

export function recordConflict(driver: SqlDriver, input: ConflictInput): void {
  driver.run(
    `INSERT INTO sync_conflicts
       (farm_id, entity_type, entity_id, local_payload_json, server_payload_json, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.farmId,
      input.entityType,
      input.entityId,
      JSON.stringify(input.localPayload),
      input.serverPayload ? JSON.stringify(input.serverPayload) : null,
      input.reason,
      nowIso(),
    ],
  );
}

export function listOpenConflicts(driver: SqlDriver, farmId: string): SyncConflict[] {
  return driver.all<SyncConflict>(
    'SELECT * FROM sync_conflicts WHERE farm_id = ? AND resolved_at IS NULL ORDER BY id',
    [farmId],
  );
}

export function resolveConflict(driver: SqlDriver, conflictId: number): void {
  driver.run('UPDATE sync_conflicts SET resolved_at = ? WHERE id = ?', [nowIso(), conflictId]);
}
