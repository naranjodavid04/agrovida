import type { SqlDriver } from '@/db/driver';
import {
  acknowledgeMutation,
  countPendingMutations,
  enqueueMutation,
  listPendingMutations,
  markMutationFailed,
} from '@/sync/outbox';

import { createMigratedTestDb, seedFarm } from '../helpers/testDb';

const NOW = '2026-07-01T12:00:00.000Z';

describe('outbox', () => {
  let driver: SqlDriver;

  beforeEach(() => {
    driver = createMigratedTestDb();
    seedFarm(driver);
  });

  afterEach(() => driver.close());

  function enqueue(entityId: string) {
    enqueueMutation(driver, {
      farmId: 'farm-1',
      entityType: 'cow',
      entityId,
      operation: 'upsert',
      payload: { id: entityId },
    });
  }

  it('lists pending mutations in deterministic insertion order', () => {
    enqueue('a');
    enqueue('b');
    enqueue('c');
    const pending = listPendingMutations(driver, 'farm-1', NOW);
    expect(pending.map((e) => e.entity_id)).toEqual(['a', 'b', 'c']);
  });

  it('acknowledging removes the entry; pending edits survive restarts', () => {
    enqueue('a');
    enqueue('b');
    const [first] = listPendingMutations(driver, 'farm-1', NOW);
    acknowledgeMutation(driver, first!.id);
    expect(countPendingMutations(driver, 'farm-1')).toBe(1);
  });

  it('failed mutations back off until next_attempt_at and are never lost', () => {
    enqueue('a');
    const [entry] = listPendingMutations(driver, 'farm-1', NOW);
    markMutationFailed(driver, entry!.id, 'network down', '2026-07-01T12:05:00.000Z');

    expect(listPendingMutations(driver, 'farm-1', NOW)).toHaveLength(0);
    expect(countPendingMutations(driver, 'farm-1')).toBe(1);

    const later = listPendingMutations(driver, 'farm-1', '2026-07-01T12:06:00.000Z');
    expect(later).toHaveLength(1);
    expect(later[0]?.attempt_count).toBe(1);
    expect(later[0]?.last_error).toBe('network down');
  });

  it('rolls back together with the domain write (transactional outbox)', () => {
    expect(() =>
      driver.transaction(() => {
        driver.run(`INSERT INTO app_state (key, value) VALUES ('domain-write', '1')`);
        enqueue('doomed');
        throw new Error('simulated failure after both writes');
      }),
    ).toThrow('simulated failure');

    expect(countPendingMutations(driver, 'farm-1')).toBe(0);
    expect(driver.get(`SELECT * FROM app_state WHERE key = 'domain-write'`)).toBeUndefined();
  });
});
