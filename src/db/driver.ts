/**
 * Synchronous SQLite driver interface (DECISIONS.md D-017). The app binds it
 * to expo-sqlite; Jest binds it to better-sqlite3. Both engines expose a
 * synchronous API, which keeps repository transactions simple and atomic.
 */

export type SqlValue = string | number | null | Uint8Array;

export interface RunResult {
  changes: number;
}

export interface SqlDriver {
  /** Executes a multi-statement SQL script (DDL, pragmas). */
  execScript(sql: string): void;
  /** Runs a single statement with bound parameters. */
  run(sql: string, params?: SqlValue[]): RunResult;
  /** Returns all rows for a query. */
  all<T>(sql: string, params?: SqlValue[]): T[];
  /** Returns the first row or undefined. */
  get<T>(sql: string, params?: SqlValue[]): T | undefined;
  /**
   * Runs `fn` atomically. Nested calls use savepoints, so a repository
   * transaction can be composed inside a sync-cycle transaction.
   */
  transaction<T>(fn: () => T): T;
  close(): void;
}

/**
 * Shared savepoint-based transaction implementation used by both drivers.
 * BEGIN IMMEDIATE at depth 0 grabs the write lock up front, avoiding
 * SQLITE_BUSY upgrades mid-transaction.
 */
export function createTransactionRunner(exec: (sql: string) => void) {
  let depth = 0;
  return function transaction<T>(fn: () => T): T {
    const savepoint = `sp_${depth}`;
    if (depth === 0) exec('BEGIN IMMEDIATE');
    else exec(`SAVEPOINT ${savepoint}`);
    depth += 1;
    try {
      const result = fn();
      depth -= 1;
      if (depth === 0) exec('COMMIT');
      else exec(`RELEASE SAVEPOINT ${savepoint}`);
      return result;
    } catch (error) {
      depth -= 1;
      if (depth === 0) exec('ROLLBACK');
      else exec(`ROLLBACK TO SAVEPOINT ${savepoint}; RELEASE SAVEPOINT ${savepoint}`);
      throw error;
    }
  };
}
