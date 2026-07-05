import type { SqlDriver } from '@/db/driver';
import { now, nowIso } from '@/lib/clock';
import { createLogger } from '@/lib/logger';
import { recordConflict } from '@/repositories/conflicts';
import { applyRemoteCow } from '@/repositories/cows';
import { applyRemoteHealthEvent, applyRemoteReproEvent } from '@/repositories/events';
import { applyRemoteFarm, applyRemoteInvite, applyRemoteMember } from '@/repositories/farms';
import { applyRemoteMilkRecord } from '@/repositories/milk';
import { applyRemoteMilkSale } from '@/repositories/sales';

import { nextAttemptIso } from './backoff';
import {
  acknowledgeMutation,
  listPendingMutations,
  markMutationFailed,
  type OutboxEntry,
} from './outbox';
import type { PullRow, SyncRemote } from './remote';
import { getPullCursor, recordSyncError, setPullCursor } from './syncState';

/**
 * Sync cycle (ARCHITECTURE §2): deterministic ordered push of the outbox,
 * then a cursor-based pull applied transactionally. Retries are idempotent
 * (client-generated UUIDs, whole-row upserts); no local mutation is ever
 * silently dropped (D-016).
 */

const log = createLogger('sync:engine');

const PULL_BATCH_SIZE = 500;

export interface SyncCycleResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  /** Transient failure that stopped the cycle; retry later. */
  transientError: string | null;
}

export async function runSyncCycle(
  driver: SqlDriver,
  remote: SyncRemote,
  farmId: string,
): Promise<SyncCycleResult> {
  const result: SyncCycleResult = { pushed: 0, pulled: 0, conflicts: 0, transientError: null };

  await pushOutbox(driver, remote, farmId, result);
  if (result.transientError === null) {
    await pullRemoteChanges(driver, remote, farmId, result);
  }

  if (result.transientError !== null) {
    recordSyncError(driver, farmId, result.transientError);
  }
  log.info('cycle finished', result);
  return result;
}

async function pushOutbox(
  driver: SqlDriver,
  remote: SyncRemote,
  farmId: string,
  result: SyncCycleResult,
): Promise<void> {
  // Deterministic order: outbox id ascending. A transient failure stops the
  // push phase so later mutations never overtake earlier ones.
  for (;;) {
    const batch = listPendingMutations(driver, farmId, nowIso(), 50);
    if (batch.length === 0) return;
    for (const entry of batch) {
      const outcome = await pushSingleMutation(driver, remote, entry, result);
      if (outcome === 'stop') {
        return;
      }
      if (outcome === 'conflict') result.conflicts += 1;
      else result.pushed += 1;
    }
  }
}

type PushOutcome = 'ok' | 'conflict' | 'stop';

async function pushSingleMutation(
  driver: SqlDriver,
  remote: SyncRemote,
  entry: OutboxEntry,
  result: SyncCycleResult,
): Promise<PushOutcome> {
  const payload = JSON.parse(entry.payload_json) as Record<string, unknown>;
  const pushResult = await remote.upsertEntity(entry.entity_type, payload);

  switch (pushResult.kind) {
    case 'ok':
      acknowledgeMutation(driver, entry.id);
      return 'ok';

    case 'transient':
      markMutationFailed(
        driver,
        entry.id,
        pushResult.message,
        nextAttemptIso(entry.attempt_count, now()),
      );
      log.warn('push transient failure; will retry', {
        entity: `${entry.entity_type}:${entry.entity_id}`,
        attempt: entry.attempt_count + 1,
      });
      result.transientError = pushResult.message;
      return 'stop';

    case 'unique_violation':
      if (entry.entity_type === 'milk_record') {
        await resolveMilkUniqueConflict(driver, remote, entry, payload);
        return 'conflict';
      }
      // e.g. duplicate tag raced from another device: keep the local row
      // visible, surface the conflict, stop retrying this payload. The owner
      // fixes the field, which enqueues a fresh mutation.
      driver.transaction(() => {
        recordConflict(driver, {
          farmId: entry.farm_id,
          entityType: entry.entity_type,
          entityId: entry.entity_id,
          localPayload: payload,
          serverPayload: null,
          reason: 'unique_violation',
        });
        acknowledgeMutation(driver, entry.id);
      });
      return 'conflict';

    case 'permission_denied':
      // Permanent server rejection (RLS/constraint). Preserve the payload in
      // diagnostics instead of retrying forever (ARCHITECTURE §9).
      driver.transaction(() => {
        recordConflict(driver, {
          farmId: entry.farm_id,
          entityType: entry.entity_type,
          entityId: entry.entity_id,
          localPayload: payload,
          serverPayload: null,
          reason: `rejected: ${pushResult.message}`,
        });
        acknowledgeMutation(driver, entry.id);
      });
      log.warn('push permanently rejected; stored in conflicts', {
        entity: `${entry.entity_type}:${entry.entity_id}`,
      });
      return 'conflict';
  }
}

/**
 * D-016: another device already owns the active (farm, cow, date, session)
 * record. Equal liters → idempotent success. Different liters → the server
 * stays canonical, the local value lands in sync_conflicts for explicit
 * owner resolution.
 */
async function resolveMilkUniqueConflict(
  driver: SqlDriver,
  remote: SyncRemote,
  entry: OutboxEntry,
  payload: Record<string, unknown>,
): Promise<void> {
  const canonical = await remote.fetchMilkRecord(
    String(payload.farm_id),
    String(payload.cow_id),
    String(payload.record_date),
    payload.session as 'morning' | 'afternoon',
  );

  driver.transaction(() => {
    if (canonical) {
      applyRemoteMilkRecord(driver, canonical);
      // Remove the losing local duplicate row (different id, same session).
      if (String(canonical.id) !== entry.entity_id) {
        driver.run('DELETE FROM milk_records WHERE id = ?', [entry.entity_id]);
      }
      const equal = Number(canonical.liters) === Number(payload.liters);
      if (!equal) {
        recordConflict(driver, {
          farmId: entry.farm_id,
          entityType: 'milk_record',
          entityId: entry.entity_id,
          localPayload: payload,
          serverPayload: canonical,
          reason: 'milk_session_conflict',
        });
      }
    } else {
      // Tombstoned remotely while we held a duplicate; keep local for review.
      recordConflict(driver, {
        farmId: entry.farm_id,
        entityType: 'milk_record',
        entityId: entry.entity_id,
        localPayload: payload,
        serverPayload: null,
        reason: 'milk_session_conflict',
      });
    }
    acknowledgeMutation(driver, entry.id);
  });
}

async function pullRemoteChanges(
  driver: SqlDriver,
  remote: SyncRemote,
  farmId: string,
  result: SyncCycleResult,
): Promise<void> {
  for (;;) {
    const cursor = getPullCursor(driver, farmId);
    let rows: PullRow[];
    try {
      rows = await remote.pullChanges(farmId, cursor, PULL_BATCH_SIZE);
    } catch (error) {
      result.transientError = error instanceof Error ? error.message : String(error);
      return;
    }
    if (rows.length === 0) {
      // Nothing new; still record the successful sync time.
      setPullCursor(driver, farmId, cursor);
      return;
    }

    // Entities with pending outbox mutations keep their local state: the
    // outbox will push them next; server-order convergence resolves the rest.
    const pendingIds = new Set(
      driver
        .all<{ entity_id: string }>('SELECT entity_id FROM sync_queue WHERE farm_id = ?', [farmId])
        .map((r) => r.entity_id),
    );

    driver.transaction(() => {
      let maxVersion = cursor;
      for (const row of rows) {
        if (row.server_version > maxVersion) maxVersion = row.server_version;
        if (pendingIds.has(row.entity_id)) continue;
        applyPulledRow(driver, row);
        result.pulled += 1;
      }
      // Cursor advances only after the whole batch is applied (§2.6).
      setPullCursor(driver, farmId, maxVersion);
    });

    if (rows.length < PULL_BATCH_SIZE) return;
  }
}

function applyPulledRow(driver: SqlDriver, row: PullRow): void {
  switch (row.entity_type) {
    case 'farm':
      applyRemoteFarm(driver, row.row_data);
      break;
    case 'farm_member':
      applyRemoteMember(driver, row.row_data);
      break;
    case 'farm_invite':
      applyRemoteInvite(driver, row.row_data);
      break;
    case 'cow':
      applyRemoteCow(driver, row.row_data);
      break;
    case 'milk_record':
      applyRemoteMilkRecord(driver, row.row_data);
      break;
    case 'health_event':
      applyRemoteHealthEvent(driver, row.row_data);
      break;
    case 'repro_event':
      applyRemoteReproEvent(driver, row.row_data);
      break;
    case 'milk_sale':
      applyRemoteMilkSale(driver, row.row_data);
      break;
  }
}
