import type { SqlDriver } from '@/db/driver';
import { createCow } from '@/repositories/cows';
import {
  activeWithdrawalUntil,
  createHealthEvent,
  createReproEvent,
  expectedCalvingDate,
  listHealthEvents,
  listReproEvents,
  softDeleteHealthEvent,
} from '@/repositories/events';
import { runSyncCycle } from '@/sync/engine';
import { countPendingMutations } from '@/sync/outbox';

import { FakeRemoteServer } from '../helpers/fakeRemote';
import { createMigratedTestDb, seedFarm } from '../helpers/testDb';

const FARM = 'farm-1';

describe('health and reproduction events (D-019)', () => {
  let driver: SqlDriver;
  let cowId: string;

  beforeEach(() => {
    driver = createMigratedTestDb();
    seedFarm(driver);
    cowId = createCow(
      driver,
      {
        farmId: FARM,
        name: 'Lola',
        tagNumber: 'A-01',
        birthDate: '2022-01-01',
        birthDateIsEstimated: false,
        breed: null,
        motherId: null,
        calvingCount: 1,
        lactationStatus: 'lactating',
        pregnancyStatus: 'open',
      },
      'user-1',
    ).id;
  });

  afterEach(() => driver.close());

  it('creates a health event with its outbox entry atomically', () => {
    const before = countPendingMutations(driver, FARM);
    const event = createHealthEvent(
      driver,
      {
        farmId: FARM,
        cowId,
        eventDate: '2026-07-02',
        eventType: 'treatment',
        description: 'Antibiótico mastitis',
        withdrawalUntil: '2026-07-06',
      },
      'user-1',
    );
    expect(event.withdrawalUntil).toBe('2026-07-06');
    expect(listHealthEvents(driver, cowId)).toHaveLength(1);
    expect(countPendingMutations(driver, FARM)).toBe(before + 1);
  });

  it('derives the active milk withdrawal and expires it', () => {
    createHealthEvent(
      driver,
      {
        farmId: FARM,
        cowId,
        eventDate: '2026-07-01',
        eventType: 'treatment',
        description: 'Tratamiento',
        withdrawalUntil: '2026-07-05',
      },
      'user-1',
    );
    expect(activeWithdrawalUntil(driver, cowId, '2026-07-03')).toBe('2026-07-05');
    expect(activeWithdrawalUntil(driver, cowId, '2026-07-05')).toBe('2026-07-05');
    expect(activeWithdrawalUntil(driver, cowId, '2026-07-06')).toBeNull();
  });

  it('derives the expected calving date from the last open insemination', () => {
    expect(expectedCalvingDate(driver, cowId)).toBeNull();

    createReproEvent(
      driver,
      {
        farmId: FARM,
        cowId,
        eventDate: '2026-06-01',
        eventType: 'insemination',
        result: null,
        notes: null,
      },
      'user-1',
    );
    // 2026-06-01 + 283 days = 2027-03-11
    expect(expectedCalvingDate(driver, cowId)).toBe('2027-03-11');

    // An 'open' pregnancy check closes the cycle.
    createReproEvent(
      driver,
      {
        farmId: FARM,
        cowId,
        eventDate: '2026-07-01',
        eventType: 'pregnancy_check',
        result: 'open',
        notes: null,
      },
      'user-1',
    );
    expect(expectedCalvingDate(driver, cowId)).toBeNull();

    // A new insemination opens a new cycle; a later calving closes it again.
    createReproEvent(
      driver,
      {
        farmId: FARM,
        cowId,
        eventDate: '2026-07-02',
        eventType: 'insemination',
        result: null,
        notes: null,
      },
      'user-1',
    );
    expect(expectedCalvingDate(driver, cowId)).toBe('2027-04-11');
    createReproEvent(
      driver,
      {
        farmId: FARM,
        cowId,
        eventDate: '2027-04-05',
        eventType: 'calving',
        result: null,
        notes: null,
      },
      'user-1',
    );
    expect(expectedCalvingDate(driver, cowId)).toBeNull();
  });

  it('rejects events for unknown cows and keeps writes atomic', () => {
    expect(() =>
      createHealthEvent(
        driver,
        {
          farmId: FARM,
          cowId: 'ghost',
          eventDate: '2026-07-02',
          eventType: 'checkup',
          description: 'x',
          withdrawalUntil: null,
        },
        'user-1',
      ),
    ).toThrow(expect.objectContaining({ code: 'cow_not_found' }));
    expect(driver.all(`SELECT * FROM sync_queue WHERE entity_type = 'health_event'`)).toHaveLength(
      0,
    );
  });

  it('syncs events both ways and propagates soft deletes', async () => {
    const remote = new FakeRemoteServer();
    const health = createHealthEvent(
      driver,
      {
        farmId: FARM,
        cowId,
        eventDate: '2026-07-02',
        eventType: 'vaccination',
        description: 'Aftosa',
        withdrawalUntil: null,
      },
      'user-1',
    );
    createReproEvent(
      driver,
      {
        farmId: FARM,
        cowId,
        eventDate: '2026-07-02',
        eventType: 'heat',
        result: null,
        notes: null,
      },
      'user-1',
    );

    const push = await runSyncCycle(driver, remote, FARM);
    expect(push.transientError).toBeNull();
    expect(remote.tables.health_event.size).toBe(1);
    expect(remote.tables.repro_event.size).toBe(1);

    // Second device pulls both, then this device tombstones the health event.
    const deviceB = createMigratedTestDb();
    seedFarm(deviceB, FARM, 'user-2');
    await runSyncCycle(deviceB, remote, FARM);
    expect(listHealthEvents(deviceB, cowId)).toHaveLength(1);
    expect(listReproEvents(deviceB, cowId)).toHaveLength(1);

    softDeleteHealthEvent(driver, health.id);
    await runSyncCycle(driver, remote, FARM);
    await runSyncCycle(deviceB, remote, FARM);
    expect(listHealthEvents(deviceB, cowId)).toHaveLength(0);
    deviceB.close();
  });
});
