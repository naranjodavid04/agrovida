import type { SqlDriver } from './driver';

/**
 * Wipes all local farm data (D-015: confirmed logout clears the device).
 * Schema and migrations remain; only rows are removed. Kept free of
 * expo-sqlite imports so Node tests can exercise it (D-017).
 */
export function clearLocalData(db: SqlDriver): void {
  db.transaction(() => {
    for (const table of [
      'milk_records',
      'cows',
      'farm_invites',
      'farm_members',
      'farms',
      'sync_queue',
      'sync_state',
      'photo_upload_queue',
      'sync_conflicts',
      'app_state',
    ]) {
      db.run(`DELETE FROM ${table}`);
    }
  });
}
