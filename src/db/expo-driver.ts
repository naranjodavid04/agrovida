import type { SQLiteDatabase } from 'expo-sqlite';

import { createTransactionRunner, type RunResult, type SqlDriver, type SqlValue } from './driver';

/** Binds the driver interface to expo-sqlite's synchronous API. */
export function createExpoDriver(db: SQLiteDatabase): SqlDriver {
  const transaction = createTransactionRunner((sql) => db.execSync(sql));
  return {
    execScript(sql: string): void {
      db.execSync(sql);
    },
    run(sql: string, params: SqlValue[] = []): RunResult {
      const result = db.runSync(sql, params);
      return { changes: result.changes };
    },
    all<T>(sql: string, params: SqlValue[] = []): T[] {
      return db.getAllSync<T>(sql, params);
    },
    get<T>(sql: string, params: SqlValue[] = []): T | undefined {
      return db.getFirstSync<T>(sql, params) ?? undefined;
    },
    transaction,
    close(): void {
      db.closeSync();
    },
  };
}
