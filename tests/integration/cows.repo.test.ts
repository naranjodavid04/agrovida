import type { SqlDriver } from '@/db/driver';
import {
  createCow,
  getCow,
  listCows,
  listDaughters,
  setLifecycleStatus,
  softDeleteCow,
  updateCow,
  type CowInput,
} from '@/repositories/cows';

import { createMigratedTestDb, seedFarm } from '../helpers/testDb';

function baseInput(overrides: Partial<CowInput> = {}): CowInput {
  return {
    farmId: 'farm-1',
    name: 'Lola',
    tagNumber: 'A-01',
    birthDate: '2022-03-10',
    birthDateIsEstimated: false,
    breed: 'Holstein',
    motherId: null,
    calvingCount: 2,
    lactationStatus: 'lactating',
    pregnancyStatus: 'pregnant',
    ...overrides,
  };
}

describe('cows repository', () => {
  let driver: SqlDriver;

  beforeEach(() => {
    driver = createMigratedTestDb();
    seedFarm(driver);
  });

  afterEach(() => driver.close());

  it('creates a cow and its outbox entry in one transaction', () => {
    const cow = createCow(driver, baseInput(), 'user-1');
    expect(cow.lifecycleStatus).toBe('active');

    const outbox = driver.all<{ entity_id: string; payload_json: string }>(
      `SELECT * FROM sync_queue WHERE entity_type = 'cow'`,
    );
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.entity_id).toBe(cow.id);
    const payload = JSON.parse(outbox[0]?.payload_json ?? '{}');
    expect(payload.tag_number).toBe('A-01');
    expect(payload.birth_date_is_estimated).toBe(false);
    // Derived values must never be stored (D-007): payload has no milk/age.
    expect(payload.milk).toBeUndefined();
    expect(payload.age).toBeUndefined();
  });

  it('rejects a duplicate active tag and leaves no partial writes', () => {
    createCow(driver, baseInput(), 'user-1');
    expect(() =>
      createCow(driver, baseInput({ name: 'Copia', tagNumber: ' a-01 ' }), 'user-1'),
    ).toThrow(expect.objectContaining({ code: 'duplicate_tag' }));

    expect(listCows(driver, 'farm-1')).toHaveLength(1);
    const outbox = driver.all(`SELECT * FROM sync_queue`);
    expect(outbox).toHaveLength(1);
  });

  it('allows tag reuse after soft deletion', () => {
    const first = createCow(driver, baseInput(), 'user-1');
    softDeleteCow(driver, first.id);
    expect(() => createCow(driver, baseInput({ name: 'Reusa' }), 'user-1')).not.toThrow();
  });

  it('enforces genealogy rules: no self-mother, mother in same farm', () => {
    const cow = createCow(driver, baseInput(), 'user-1');
    expect(() => updateCow(driver, cow.id, { motherId: cow.id })).toThrow(
      expect.objectContaining({ code: 'own_mother' }),
    );

    seedFarm(driver, 'farm-2', 'user-2');
    const foreign = createCow(driver, baseInput({ farmId: 'farm-2', tagNumber: 'B-01' }), 'user-2');
    expect(() => updateCow(driver, cow.id, { motherId: foreign.id })).toThrow(
      expect.objectContaining({ code: 'mother_other_farm' }),
    );

    expect(() => updateCow(driver, cow.id, { motherId: 'ghost' })).toThrow(
      expect.objectContaining({ code: 'mother_not_found' }),
    );
  });

  it('navigates mother and daughters', () => {
    const mother = createCow(driver, baseInput({ name: 'Madre', tagNumber: 'M-01' }), 'user-1');
    const daughter = createCow(
      driver,
      baseInput({ name: 'Hija', tagNumber: 'H-01', motherId: mother.id }),
      'user-1',
    );
    expect(getCow(driver, daughter.id)?.motherId).toBe(mother.id);
    expect(listDaughters(driver, mother.id).map((c) => c.id)).toEqual([daughter.id]);
  });

  it('searches by name and tag', () => {
    createCow(driver, baseInput({ name: 'Lola', tagNumber: 'A-01' }), 'user-1');
    createCow(driver, baseInput({ name: 'Manchas', tagNumber: 'B-77' }), 'user-1');
    expect(listCows(driver, 'farm-1', 'lol')).toHaveLength(1);
    expect(listCows(driver, 'farm-1', 'B-77')).toHaveLength(1);
    expect(listCows(driver, 'farm-1', 'nada')).toHaveLength(0);
  });

  it('keeps status dimensions independent (D-005)', () => {
    const cow = createCow(driver, baseInput(), 'user-1');
    expect(cow.lactationStatus).toBe('lactating');
    expect(cow.pregnancyStatus).toBe('pregnant');

    const updated = setLifecycleStatus(driver, cow.id, 'sold');
    expect(updated.lifecycleStatus).toBe('sold');
    expect(updated.lactationStatus).toBe('lactating');
    expect(updated.pregnancyStatus).toBe('pregnant');
  });

  it('soft delete hides the cow and queues a tombstone upsert', () => {
    const cow = createCow(driver, baseInput(), 'user-1');
    softDeleteCow(driver, cow.id);
    expect(getCow(driver, cow.id)).toBeNull();
    const entries = driver.all<{ payload_json: string }>(
      `SELECT payload_json FROM sync_queue WHERE entity_id = ? ORDER BY id`,
      [cow.id],
    );
    expect(entries).toHaveLength(2);
    const tombstone = JSON.parse(entries[1]?.payload_json ?? '{}');
    expect(tombstone.deleted_at).not.toBeNull();
  });
});
