import type { SqlDriver } from '@/db/driver';
import { nowIso } from '@/lib/clock';

/**
 * Transactional outbox (ARCHITECTURE §2/§4). Repositories enqueue a mutation
 * in the same SQLite transaction as the domain write; the sync engine pushes
 * entries in id order (deterministic) and acknowledges them transactionally.
 *
 * Payloads are full row snapshots in remote column shape, so pushes are
 * idempotent upserts keyed by client-generated UUIDs.
 */

export type EntityType = 'cow' | 'milk_record';
export type OutboxOperation = 'upsert';

export interface OutboxEntry {
  id: number;
  farm_id: string;
  entity_type: EntityType;
  entity_id: string;
  operation: OutboxOperation;
  payload_json: string;
  created_at: string;
  attempt_count: number;
  last_error: string | null;
  next_attempt_at: string | null;
}

export interface EnqueueInput {
  farmId: string;
  entityType: EntityType;
  entityId: string;
  operation: OutboxOperation;
  payload: Record<string, unknown>;
}

/** Must be called inside the same transaction as the domain write. */
export function enqueueMutation(driver: SqlDriver, input: EnqueueInput): void {
  driver.run(
    `INSERT INTO sync_queue (farm_id, entity_type, entity_id, operation, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.farmId,
      input.entityType,
      input.entityId,
      input.operation,
      JSON.stringify(input.payload),
      nowIso(),
    ],
  );
}

/** Entries due for push, in deterministic id order. */
export function listPendingMutations(
  driver: SqlDriver,
  farmId: string,
  asOfIso: string,
  limit = 100,
): OutboxEntry[] {
  return driver.all<OutboxEntry>(
    `SELECT * FROM sync_queue
     WHERE farm_id = ?
       AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
     ORDER BY id
     LIMIT ?`,
    [farmId, asOfIso, limit],
  );
}

export function countPendingMutations(driver: SqlDriver, farmId: string): number {
  const row = driver.get<{ n: number }>('SELECT COUNT(*) AS n FROM sync_queue WHERE farm_id = ?', [
    farmId,
  ]);
  return row?.n ?? 0;
}

/** Removes an acknowledged mutation after a successful push. */
export function acknowledgeMutation(driver: SqlDriver, id: number): void {
  driver.run('DELETE FROM sync_queue WHERE id = ?', [id]);
}

/** Records a failed attempt and schedules the bounded-backoff retry. */
export function markMutationFailed(
  driver: SqlDriver,
  id: number,
  error: string,
  nextAttemptAtIso: string,
): void {
  driver.run(
    `UPDATE sync_queue
     SET attempt_count = attempt_count + 1, last_error = ?, next_attempt_at = ?
     WHERE id = ?`,
    [error.slice(0, 500), nextAttemptAtIso, id],
  );
}
