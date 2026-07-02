import type { SqlDriver } from '@/db/driver';
import { listOpenConflicts } from '@/repositories/conflicts';
import { createCow, getCow, listCows } from '@/repositories/cows';
import { getMilkRecord, upsertMilkRecord } from '@/repositories/milk';
import { runSyncCycle } from '@/sync/engine';
import { countPendingMutations, listPendingMutations } from '@/sync/outbox';
import { getPullCursor } from '@/sync/syncState';

import { FakeRemoteServer } from '../helpers/fakeRemote';
import { createMigratedTestDb, seedFarm } from '../helpers/testDb';

const FARM = 'farm-1';
const TODAY = '2026-07-02';

function makeCow(driver: SqlDriver, name: string, tag: string, userId = 'user-1') {
  return createCow(
    driver,
    {
      farmId: FARM,
      name,
      tagNumber: tag,
      birthDate: '2022-01-01',
      birthDateIsEstimated: false,
      breed: 'Holstein',
      motherId: null,
      calvingCount: 1,
      lactationStatus: 'lactating',
      pregnancyStatus: 'open',
    },
    userId,
  );
}

describe('sync engine', () => {
  let driver: SqlDriver;
  let remote: FakeRemoteServer;

  beforeEach(() => {
    driver = createMigratedTestDb();
    seedFarm(driver, FARM, 'user-1');
    remote = new FakeRemoteServer();
  });

  afterEach(() => driver.close());

  it('pushes outbox entries in deterministic order and acknowledges them', async () => {
    const cow = makeCow(driver, 'Lola', 'A-01');
    upsertMilkRecord(
      driver,
      { farmId: FARM, cowId: cow.id, recordDate: TODAY, session: 'morning', liters: 10 },
      'user-1',
    );

    const result = await runSyncCycle(driver, remote, FARM);
    expect(result.pushed).toBe(2);
    expect(result.transientError).toBeNull();
    expect(countPendingMutations(driver, FARM)).toBe(0);
    expect(remote.upsertLog[0]).toBe(`cow:${cow.id}`);
    expect(remote.tables.cow.has(cow.id)).toBe(true);
  });

  it('stops on transient failure, backs off, and retries without losing mutations', async () => {
    const cow = makeCow(driver, 'Lola', 'A-01');
    upsertMilkRecord(
      driver,
      { farmId: FARM, cowId: cow.id, recordDate: TODAY, session: 'morning', liters: 10 },
      'user-1',
    );
    remote.failNextUpserts = 1;

    const first = await runSyncCycle(driver, remote, FARM);
    expect(first.pushed).toBe(0);
    expect(first.transientError).toContain('simulated network failure');
    // Both mutations still pending; the failed one has backoff metadata.
    expect(countPendingMutations(driver, FARM)).toBe(2);
    const later = new Date(Date.now() + 60_000).toISOString();
    const pending = listPendingMutations(driver, FARM, later);
    expect(pending[0]?.attempt_count).toBe(1);
    expect(pending[0]?.last_error).toContain('simulated');

    // The retry is idempotent: same ids, whole-row upserts.
    jest.useFakeTimers().setSystemTime(new Date(Date.now() + 60_000));
    const second = await runSyncCycle(driver, remote, FARM);
    jest.useRealTimers();
    expect(second.pushed).toBe(2);
    expect(countPendingMutations(driver, FARM)).toBe(0);
  });

  it('tolerates duplicate delivery (ack lost after a successful push)', async () => {
    const cow = makeCow(driver, 'Lola', 'A-01');
    await runSyncCycle(driver, remote, FARM);

    // Simulate a crash after push but before ack: re-enqueue the same payload.
    const serverRow = remote.tables.cow.get(cow.id);
    driver.run(
      `INSERT INTO sync_queue (farm_id, entity_type, entity_id, operation, payload_json, created_at)
       SELECT ?, 'cow', ?, 'upsert', ?, '2026-07-02T00:00:00Z'`,
      [FARM, cow.id, JSON.stringify({ ...serverRow, server_version: undefined })],
    );
    const result = await runSyncCycle(driver, remote, FARM);
    expect(result.transientError).toBeNull();
    expect(remote.upsertLog.filter((e) => e === `cow:${cow.id}`)).toHaveLength(2);
    expect(remote.tables.cow.size).toBe(1);
    expect(countPendingMutations(driver, FARM)).toBe(0);
  });

  it('pulls remote changes, applies tombstones, and advances the cursor after apply', async () => {
    remote.seed('cow', {
      id: 'remote-cow',
      farm_id: FARM,
      name: 'Remota',
      tag_number: 'R-01',
      photo_path: null,
      birth_date: null,
      birth_date_is_estimated: false,
      breed: null,
      mother_id: null,
      calving_count: 0,
      lifecycle_status: 'active',
      lactation_status: 'unknown',
      pregnancy_status: 'unknown',
      created_by: 'user-2',
      created_at: '2026-07-01T00:00:00Z',
      deleted_at: null,
    });

    const result = await runSyncCycle(driver, remote, FARM);
    expect(result.pulled).toBe(1);
    expect(getCow(driver, 'remote-cow')?.name).toBe('Remota');
    expect(getPullCursor(driver, FARM)).toBe(1);

    // Tombstone propagates and disappears locally.
    remote.seed('cow', {
      ...remote.tables.cow.get('remote-cow'),
      deleted_at: '2026-07-02T00:00:00Z',
    });
    await runSyncCycle(driver, remote, FARM);
    expect(getCow(driver, 'remote-cow')).toBeNull();
    expect(getPullCursor(driver, FARM)).toBe(2);
  });

  it('does not advance the cursor when the pull fails', async () => {
    remote.seed('cow', {
      id: 'remote-cow',
      farm_id: FARM,
      name: 'Remota',
      created_by: 'u',
      created_at: 'x',
      deleted_at: null,
      lifecycle_status: 'active',
      lactation_status: 'unknown',
      pregnancy_status: 'unknown',
      calving_count: 0,
      birth_date_is_estimated: false,
    });
    remote.failPulls = true;
    const result = await runSyncCycle(driver, remote, FARM);
    expect(result.transientError).toContain('simulated pull failure');
    expect(getPullCursor(driver, FARM)).toBe(0);

    remote.failPulls = false;
    await runSyncCycle(driver, remote, FARM);
    expect(getPullCursor(driver, FARM)).toBe(1);
  });

  it('keeps local unpushed edits when a pull arrives for the same entity', async () => {
    const seeded = remote.seed('cow', {
      id: 'shared-cow',
      farm_id: FARM,
      name: 'Original',
      tag_number: null,
      photo_path: null,
      birth_date: null,
      birth_date_is_estimated: false,
      breed: null,
      mother_id: null,
      calving_count: 0,
      lifecycle_status: 'active',
      lactation_status: 'unknown',
      pregnancy_status: 'unknown',
      created_by: 'user-2',
      created_at: '2026-07-01T00:00:00Z',
      deleted_at: null,
    });
    await runSyncCycle(driver, remote, FARM);

    // Offline local edit (pending in outbox), then the server row changes too.
    driver.run(`UPDATE cows SET name = 'Editada Local' WHERE id = 'shared-cow'`);
    driver.run(
      `INSERT INTO sync_queue (farm_id, entity_type, entity_id, operation, payload_json, created_at)
       VALUES (?, 'cow', 'shared-cow', 'upsert', ?, '2026-07-02T00:00:00Z')`,
      [FARM, JSON.stringify({ ...seeded, name: 'Editada Local', server_version: undefined })],
    );
    remote.seed('cow', { ...seeded, name: 'Editada Remota' });

    const result = await runSyncCycle(driver, remote, FARM);
    expect(result.transientError).toBeNull();
    // Local push wins in server order (it happened after the remote edit).
    expect(remote.tables.cow.get('shared-cow')?.name).toBe('Editada Local');
    expect(getCow(driver, 'shared-cow')?.name).toBe('Editada Local');
  });

  describe('milk session unique conflicts (D-016)', () => {
    it('treats equal liters as idempotent success without conflict', async () => {
      const cow = makeCow(driver, 'Lola', 'A-01');
      await runSyncCycle(driver, remote, FARM);

      // Another device already recorded the same session with the same value.
      remote.seed('milk_record', {
        id: 'other-device-record',
        farm_id: FARM,
        cow_id: cow.id,
        record_date: TODAY,
        session: 'morning',
        liters: 10,
        recorded_by: 'user-2',
        created_at: '2026-07-02T05:00:00Z',
        deleted_at: null,
      });
      upsertMilkRecord(
        driver,
        { farmId: FARM, cowId: cow.id, recordDate: TODAY, session: 'morning', liters: 10 },
        'user-1',
      );

      const result = await runSyncCycle(driver, remote, FARM);
      expect(result.conflicts).toBe(1);
      expect(listOpenConflicts(driver, FARM)).toHaveLength(0);
      // Local converges to the canonical record id.
      const local = getMilkRecord(driver, FARM, cow.id, TODAY, 'morning');
      expect(local?.id).toBe('other-device-record');
      expect(local?.liters).toBe(10);
      expect(countPendingMutations(driver, FARM)).toBe(0);
    });

    it('keeps the server canonical and surfaces differing values for resolution', async () => {
      const cow = makeCow(driver, 'Lola', 'A-01');
      await runSyncCycle(driver, remote, FARM);

      remote.seed('milk_record', {
        id: 'other-device-record',
        farm_id: FARM,
        cow_id: cow.id,
        record_date: TODAY,
        session: 'morning',
        liters: 8,
        recorded_by: 'user-2',
        created_at: '2026-07-02T05:00:00Z',
        deleted_at: null,
      });
      upsertMilkRecord(
        driver,
        { farmId: FARM, cowId: cow.id, recordDate: TODAY, session: 'morning', liters: 12 },
        'user-1',
      );

      const result = await runSyncCycle(driver, remote, FARM);
      expect(result.conflicts).toBe(1);

      const conflicts = listOpenConflicts(driver, FARM);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]?.reason).toBe('milk_session_conflict');
      expect(JSON.parse(conflicts[0]?.local_payload_json ?? '{}').liters).toBe(12);

      // Server value is canonical locally; nothing left pending.
      const local = getMilkRecord(driver, FARM, cow.id, TODAY, 'morning');
      expect(local?.liters).toBe(8);
      expect(countPendingMutations(driver, FARM)).toBe(0);
    });
  });

  it('converges two devices after offline edits (acceptance §8)', async () => {
    // Device A creates data and syncs.
    const cowA = makeCow(driver, 'Lola', 'A-01');
    upsertMilkRecord(
      driver,
      { farmId: FARM, cowId: cowA.id, recordDate: TODAY, session: 'morning', liters: 10 },
      'user-1',
    );
    await runSyncCycle(driver, remote, FARM);

    // Device B starts empty, pulls, edits the record, and pushes.
    const deviceB = createMigratedTestDb();
    seedFarm(deviceB, FARM, 'user-2');
    await runSyncCycle(deviceB, remote, FARM);
    expect(listCows(deviceB, FARM)).toHaveLength(1);
    upsertMilkRecord(
      deviceB,
      { farmId: FARM, cowId: cowA.id, recordDate: TODAY, session: 'morning', liters: 14 },
      'user-2',
    );
    await runSyncCycle(deviceB, remote, FARM);

    // Device A pulls and converges to B's edit.
    await runSyncCycle(driver, remote, FARM);
    expect(getMilkRecord(driver, FARM, cowA.id, TODAY, 'morning')?.liters).toBe(14);
    expect(getMilkRecord(deviceB, FARM, cowA.id, TODAY, 'morning')?.liters).toBe(14);
    deviceB.close();
  });
});
