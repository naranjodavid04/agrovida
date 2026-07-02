import { createLogger } from '@/lib/logger';

import type { SqlDriver } from './driver';
import { LOCAL_MIGRATIONS } from './schema';

const log = createLogger('db:migrations');

interface UserVersionRow {
  user_version: number;
}

export function getSchemaVersion(driver: SqlDriver): number {
  const row = driver.get<UserVersionRow>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * Applies pending migrations in order. Each migration runs inside a
 * transaction together with its user_version bump, so a failed migration
 * leaves the database at the previous version.
 */
export function runMigrations(driver: SqlDriver): void {
  const current = getSchemaVersion(driver);
  for (let version = current; version < LOCAL_MIGRATIONS.length; version += 1) {
    const script = LOCAL_MIGRATIONS[version];
    if (!script) throw new Error(`missing local migration for version ${version + 1}`);
    driver.transaction(() => {
      driver.execScript(script);
      // PRAGMA does not support bound parameters; version is a trusted int.
      driver.execScript(`PRAGMA user_version = ${version + 1}`);
    });
    log.info(`applied local migration v${version + 1}`);
  }
}
