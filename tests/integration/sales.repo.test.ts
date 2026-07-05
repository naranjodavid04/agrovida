import type { SqlDriver } from '@/db/driver';
import { buildSalesCsv, CSV_BOM } from '@/features/export/csv';
import { formatCOP } from '@/lib/money';
import {
  createMilkSale,
  listMilkSales,
  monthlySalesSummary,
  softDeleteMilkSale,
} from '@/repositories/sales';
import { runSyncCycle } from '@/sync/engine';
import { countPendingMutations } from '@/sync/outbox';

import { FakeRemoteServer } from '../helpers/fakeRemote';
import { createMigratedTestDb, seedFarm } from '../helpers/testDb';

const FARM = 'farm-1';

describe('milk sales (ROADMAP H1)', () => {
  let driver: SqlDriver;

  beforeEach(() => {
    driver = createMigratedTestDb();
    seedFarm(driver);
  });

  afterEach(() => driver.close());

  function sale(date: string, liters: number, price: number) {
    return createMilkSale(
      driver,
      {
        farmId: FARM,
        saleDate: date,
        liters,
        pricePerLiter: price,
        fatPercent: 3.8,
        proteinPercent: null,
        notes: null,
      },
      'user-1',
    );
  }

  it('creates a sale with its outbox entry atomically', () => {
    sale('2026-07-03', 120.5, 2050);
    expect(listMilkSales(driver, FARM)).toHaveLength(1);
    expect(countPendingMutations(driver, FARM)).toBe(1);
  });

  it('rejects non-positive liters and invalid prices without partial writes', () => {
    expect(() => sale('2026-07-03', 0, 2000)).toThrow();
    expect(() => sale('2026-07-03', 10, NaN)).toThrow();
    expect(listMilkSales(driver, FARM)).toHaveLength(0);
    expect(countPendingMutations(driver, FARM)).toBe(0);
  });

  it('derives the monthly settlement (liters and income) excluding deletions', () => {
    sale('2026-07-01', 100, 2000);
    sale('2026-07-15', 50, 2100);
    sale('2026-06-30', 999, 2000); // previous month

    const july = monthlySalesSummary(driver, FARM, '2026-07');
    expect(july.liters).toBeCloseTo(150);
    expect(july.income).toBeCloseTo(100 * 2000 + 50 * 2100);

    const deleted = sale('2026-07-20', 10, 2000);
    softDeleteMilkSale(driver, deleted.id);
    expect(monthlySalesSummary(driver, FARM, '2026-07').liters).toBeCloseTo(150);
  });

  it('formats Colombian pesos', () => {
    const formatted = formatCOP(305000);
    expect(formatted).toMatch(/305\.000/);
    expect(formatted).toContain('$');
  });

  it('exports the sales CSV with derived totals', () => {
    sale('2026-07-03', 120.5, 2050);
    const lines = buildSalesCsv(driver, FARM).slice(CSV_BOM.length).trim().split('\r\n');
    expect(lines[0]).toContain('Precio por litro');
    expect(lines[1]).toContain('120,5');
    expect(lines[1]).toContain('247025'); // 120.5 * 2050, comma decimals not needed (integer)
  });

  it('syncs sales across devices including tombstones', async () => {
    const remote = new FakeRemoteServer();
    const first = sale('2026-07-03', 100, 2000);
    await runSyncCycle(driver, remote, FARM);
    expect(remote.tables.milk_sale.size).toBe(1);

    const deviceB = createMigratedTestDb();
    seedFarm(deviceB, FARM, 'user-2');
    await runSyncCycle(deviceB, remote, FARM);
    expect(listMilkSales(deviceB, FARM)).toHaveLength(1);

    softDeleteMilkSale(driver, first.id);
    await runSyncCycle(driver, remote, FARM);
    await runSyncCycle(deviceB, remote, FARM);
    expect(listMilkSales(deviceB, FARM)).toHaveLength(0);
    deviceB.close();
  });
});
