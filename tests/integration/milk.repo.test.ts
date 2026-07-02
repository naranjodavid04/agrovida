import type { SqlDriver } from '@/db/driver';
import { createCow } from '@/repositories/cows';
import {
  dayDeltaForCow,
  farmSevenDayTrend,
  farmTotalForDate,
  getMilkRecord,
  listMilkHistory,
  sevenDayTrendForCow,
  softDeleteMilkRecord,
  totalForCowOnDate,
  upsertMilkRecord,
} from '@/repositories/milk';

import { createMigratedTestDb, seedFarm } from '../helpers/testDb';

const TODAY = '2026-07-01';

describe('milk repository', () => {
  let driver: SqlDriver;
  let cowId: string;

  beforeEach(() => {
    driver = createMigratedTestDb();
    seedFarm(driver);
    cowId = createCow(
      driver,
      {
        farmId: 'farm-1',
        name: 'Lola',
        tagNumber: 'A-01',
        birthDate: '2022-03-10',
        birthDateIsEstimated: false,
        breed: 'Holstein',
        motherId: null,
        calvingCount: 2,
        lactationStatus: 'lactating',
        pregnancyStatus: 'open',
      },
      'user-1',
    ).id;
  });

  afterEach(() => driver.close());

  function record(date: string, session: 'morning' | 'afternoon', liters: number) {
    return upsertMilkRecord(
      driver,
      { farmId: 'farm-1', cowId, recordDate: date, session, liters },
      'user-1',
    );
  }

  it('creates one record per session and edits it in place (session uniqueness)', () => {
    const first = record(TODAY, 'morning', 10);
    const edited = record(TODAY, 'morning', 12.5);
    expect(edited.id).toBe(first.id);

    const rows = driver.all(`SELECT * FROM milk_records WHERE deleted_at IS NULL`);
    expect(rows).toHaveLength(1);
    expect(getMilkRecord(driver, 'farm-1', cowId, TODAY, 'morning')?.liters).toBe(12.5);
  });

  it('writes an outbox entry per mutation, atomically', () => {
    record(TODAY, 'morning', 10);
    record(TODAY, 'morning', 12.5);
    const outbox = driver.all(`SELECT * FROM sync_queue WHERE entity_type = 'milk_record'`);
    expect(outbox).toHaveLength(2);

    expect(() => record(TODAY, 'afternoon', -3)).toThrow(
      expect.objectContaining({ code: 'invalid_liters' }),
    );
    expect(driver.all(`SELECT * FROM sync_queue WHERE entity_type = 'milk_record'`)).toHaveLength(
      2,
    );
  });

  it('rejects records for unknown or deleted cows', () => {
    expect(() =>
      upsertMilkRecord(
        driver,
        { farmId: 'farm-1', cowId: 'ghost', recordDate: TODAY, session: 'morning', liters: 5 },
        'user-1',
      ),
    ).toThrow(expect.objectContaining({ code: 'cow_not_found' }));
  });

  it('derives daily totals from morning + afternoon', () => {
    record(TODAY, 'morning', 10);
    record(TODAY, 'afternoon', 8.5);
    expect(totalForCowOnDate(driver, cowId, TODAY)).toBeCloseTo(18.5);
  });

  it('derives yesterday delta, with null when there is no comparison', () => {
    record(TODAY, 'morning', 10);
    const noComparison = dayDeltaForCow(driver, cowId, TODAY);
    expect(noComparison.yesterday).toBeNull();
    expect(noComparison.delta).toBeNull();

    record('2026-06-30', 'morning', 7);
    record('2026-06-30', 'afternoon', 5);
    const withComparison = dayDeltaForCow(driver, cowId, TODAY);
    expect(withComparison.today).toBeCloseTo(10);
    expect(withComparison.yesterday).toBeCloseTo(12);
    expect(withComparison.delta).toBeCloseTo(-2);
  });

  it('builds a seven-day trend padded with zeros', () => {
    record(TODAY, 'morning', 10);
    record('2026-06-28', 'afternoon', 6);
    const trend = sevenDayTrendForCow(driver, cowId, TODAY);
    expect(trend).toHaveLength(7);
    expect(trend[0]).toEqual({ date: '2026-06-25', total: 0 });
    expect(trend[3]).toEqual({ date: '2026-06-28', total: 6 });
    expect(trend[6]).toEqual({ date: TODAY, total: 10 });
  });

  it('derives farm totals across cows and excludes soft-deleted records', () => {
    const otherCow = createCow(
      driver,
      {
        farmId: 'farm-1',
        name: 'Manchas',
        tagNumber: 'B-02',
        birthDate: null,
        birthDateIsEstimated: false,
        breed: null,
        motherId: null,
        calvingCount: 0,
        lactationStatus: 'lactating',
        pregnancyStatus: 'unknown',
      },
      'user-1',
    ).id;
    record(TODAY, 'morning', 10);
    const other = upsertMilkRecord(
      driver,
      { farmId: 'farm-1', cowId: otherCow, recordDate: TODAY, session: 'morning', liters: 4 },
      'user-1',
    );
    expect(farmTotalForDate(driver, 'farm-1', TODAY)).toBeCloseTo(14);

    softDeleteMilkRecord(driver, other.id);
    expect(farmTotalForDate(driver, 'farm-1', TODAY)).toBeCloseTo(10);

    const trend = farmSevenDayTrend(driver, 'farm-1', TODAY);
    expect(trend[6]).toEqual({ date: TODAY, total: 10 });
  });

  it('lists per-cow history most recent first', () => {
    record('2026-06-29', 'morning', 5);
    record(TODAY, 'morning', 10);
    record(TODAY, 'afternoon', 8);
    const history = listMilkHistory(driver, cowId);
    expect(history.map((r) => `${r.recordDate}/${r.session}`)).toEqual([
      '2026-07-01/morning',
      '2026-07-01/afternoon',
      '2026-06-29/morning',
    ]);
  });
});
