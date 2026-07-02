import type { SqlDriver } from '@/db/driver';
import { upsertMilkRecord } from '@/repositories/milk';
import { resolveConflict, type SyncConflict } from '@/repositories/conflicts';
import type { MilkSession } from '@/types/domain';

/**
 * Explicit conflict resolution (D-016). "Keep server" simply closes the
 * conflict (the canonical row is already applied locally). "Use local"
 * re-applies the preserved local value as a fresh edit of the canonical
 * record, which flows through the normal outbox push.
 */

export function resolveKeepServer(driver: SqlDriver, conflict: SyncConflict): void {
  resolveConflict(driver, conflict.id);
}

export function resolveUseLocal(driver: SqlDriver, conflict: SyncConflict, userId: string): void {
  const local = JSON.parse(conflict.local_payload_json) as Record<string, unknown>;
  driver.transaction(() => {
    if (conflict.entity_type === 'milk_record') {
      upsertMilkRecord(
        driver,
        {
          farmId: String(local.farm_id),
          cowId: String(local.cow_id),
          recordDate: String(local.record_date),
          session: local.session as MilkSession,
          liters: Number(local.liters),
        },
        userId,
      );
    }
    resolveConflict(driver, conflict.id);
  });
}
