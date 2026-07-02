import * as Crypto from 'expo-crypto';
import { openDatabaseSync } from 'expo-sqlite';

import { setIdGenerator } from '@/lib/ids';

import type { SqlDriver } from './driver';
import { createExpoDriver } from './expo-driver';
import { runMigrations } from './migrations';

let driver: SqlDriver | null = null;

/**
 * Opens (once) the app database, applies pragmas and migrations, and wires
 * the ID generator. All repositories read from this driver.
 */
export function getDatabase(): SqlDriver {
  if (driver) return driver;
  setIdGenerator(() => Crypto.randomUUID());
  const db = openDatabaseSync('agrovida.db');
  const created = createExpoDriver(db);
  created.execScript('PRAGMA journal_mode = WAL');
  created.execScript('PRAGMA foreign_keys = ON');
  runMigrations(created);
  driver = created;
  return driver;
}

/** Test/logout hook: closes and forgets the singleton. */
export function closeDatabase(): void {
  if (!driver) return;
  driver.close();
  driver = null;
}
