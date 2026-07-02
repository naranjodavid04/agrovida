import Database from 'better-sqlite3';

import { createTransactionRunner, type SqlDriver, type SqlValue } from '@/db/driver';
import { runMigrations } from '@/db/migrations';

/**
 * In-memory better-sqlite3 driver for Jest (D-017): same SQL dialect as
 * expo-sqlite, so migrations, repositories, and the sync engine run against
 * the real schema without an emulator.
 */
export function createTestDriver(): SqlDriver {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const transaction = createTransactionRunner((sql) => db.exec(sql));
  return {
    execScript(sql: string): void {
      db.exec(sql);
    },
    run(sql: string, params: SqlValue[] = []) {
      const result = db.prepare(sql).run(...params);
      return { changes: result.changes };
    },
    all<T>(sql: string, params: SqlValue[] = []): T[] {
      return db.prepare(sql).all(...params) as T[];
    },
    get<T>(sql: string, params: SqlValue[] = []): T | undefined {
      return db.prepare(sql).get(...params) as T | undefined;
    },
    transaction,
    close(): void {
      db.close();
    },
  };
}

/** Fresh migrated database for a test. */
export function createMigratedTestDb(): SqlDriver {
  const driver = createTestDriver();
  runMigrations(driver);
  return driver;
}

/** Seeds a farm with an owner membership, bypassing sync (remote-origin rows). */
export function seedFarm(
  driver: SqlDriver,
  farmId = 'farm-1',
  userId = 'user-1',
): { farmId: string; userId: string } {
  driver.run(
    `INSERT INTO farms (id, name, created_by, created_at, server_version)
     VALUES (?, 'Finca Test', ?, '2026-01-01T00:00:00.000Z', 1)`,
    [farmId, userId],
  );
  driver.run(
    `INSERT INTO farm_members (id, farm_id, user_id, role, membership_status, created_at, server_version)
     VALUES (?, ?, ?, 'owner', 'active', '2026-01-01T00:00:00.000Z', 2)`,
    [`member-${farmId}-${userId}`, farmId, userId],
  );
  return { farmId, userId };
}
