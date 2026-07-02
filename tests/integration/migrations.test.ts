import { getSchemaVersion, runMigrations } from '@/db/migrations';
import { LOCAL_MIGRATIONS } from '@/db/schema';

import { createTestDriver } from '../helpers/testDb';

describe('local migrations', () => {
  it('applies all migrations on a fresh database', () => {
    const driver = createTestDriver();
    expect(getSchemaVersion(driver)).toBe(0);
    runMigrations(driver);
    expect(getSchemaVersion(driver)).toBe(LOCAL_MIGRATIONS.length);

    const tables = driver
      .all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .map((t) => t.name);
    for (const expected of [
      'farms',
      'farm_members',
      'farm_invites',
      'cows',
      'milk_records',
      'sync_queue',
      'sync_state',
      'photo_upload_queue',
      'sync_conflicts',
      'app_state',
    ]) {
      expect(tables).toContain(expected);
    }
    driver.close();
  });

  it('is idempotent', () => {
    const driver = createTestDriver();
    runMigrations(driver);
    expect(() => runMigrations(driver)).not.toThrow();
    expect(getSchemaVersion(driver)).toBe(LOCAL_MIGRATIONS.length);
    driver.close();
  });

  it('rolls back atomically when a transaction fails midway', () => {
    const driver = createTestDriver();
    runMigrations(driver);
    expect(() =>
      driver.transaction(() => {
        driver.run(`INSERT INTO app_state (key, value) VALUES ('probe', '1')`);
        throw new Error('boom');
      }),
    ).toThrow('boom');
    const row = driver.get<{ value: string }>(`SELECT value FROM app_state WHERE key = 'probe'`);
    expect(row).toBeUndefined();
    driver.close();
  });

  it('supports nested transactions via savepoints', () => {
    const driver = createTestDriver();
    runMigrations(driver);
    driver.transaction(() => {
      driver.run(`INSERT INTO app_state (key, value) VALUES ('outer', '1')`);
      expect(() =>
        driver.transaction(() => {
          driver.run(`INSERT INTO app_state (key, value) VALUES ('inner', '1')`);
          throw new Error('inner boom');
        }),
      ).toThrow('inner boom');
    });
    expect(driver.get(`SELECT * FROM app_state WHERE key = 'outer'`)).toBeDefined();
    expect(driver.get(`SELECT * FROM app_state WHERE key = 'inner'`)).toBeUndefined();
    driver.close();
  });
});
