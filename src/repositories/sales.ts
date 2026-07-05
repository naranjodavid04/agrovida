import type { SqlDriver } from '@/db/driver';
import { nowIso } from '@/lib/clock';
import { newId } from '@/lib/ids';
import { DomainError, validateRecordDate } from '@/lib/validation';
import { enqueueMutation } from '@/sync/outbox';
import type { MilkSale } from '@/types/domain';

/**
 * Milk sales/settlements (ROADMAP H1). Income is always derived on read
 * (liters × price); nothing aggregated is stored. Same transactional-outbox
 * contract as the rest of the domain.
 */

interface SaleRow {
  id: string;
  farm_id: string;
  sale_date: string;
  liters: number;
  price_per_liter: number;
  fat_percent: number | null;
  protein_percent: number | null;
  notes: string | null;
  recorded_by: string;
  created_at: string;
  deleted_at: string | null;
  server_version: number;
  local_updated_at: string;
}

function rowToSale(row: SaleRow): MilkSale {
  return {
    id: row.id,
    farmId: row.farm_id,
    saleDate: row.sale_date,
    liters: row.liters,
    pricePerLiter: row.price_per_liter,
    fatPercent: row.fat_percent,
    proteinPercent: row.protein_percent,
    notes: row.notes,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

function salePayload(row: SaleRow): Record<string, unknown> {
  return {
    id: row.id,
    farm_id: row.farm_id,
    sale_date: row.sale_date,
    liters: row.liters,
    price_per_liter: row.price_per_liter,
    fat_percent: row.fat_percent,
    protein_percent: row.protein_percent,
    notes: row.notes,
    recorded_by: row.recorded_by,
    created_at: row.created_at,
    deleted_at: row.deleted_at,
  };
}

export interface MilkSaleInput {
  farmId: string;
  saleDate: string;
  liters: number;
  pricePerLiter: number;
  fatPercent: number | null;
  proteinPercent: number | null;
  notes: string | null;
}

export function createMilkSale(driver: SqlDriver, input: MilkSaleInput, userId: string): MilkSale {
  validateRecordDate(input.saleDate);
  if (!Number.isFinite(input.liters) || input.liters <= 0) {
    throw new DomainError('invalid_liters');
  }
  if (!Number.isFinite(input.pricePerLiter) || input.pricePerLiter < 0) {
    throw new DomainError('invalid_liters', 'invalid price');
  }
  const id = newId();
  const timestamp = nowIso();

  return driver.transaction(() => {
    driver.run(
      `INSERT INTO milk_sales (
        id, farm_id, sale_date, liters, price_per_liter, fat_percent,
        protein_percent, notes, recorded_by, created_at, deleted_at,
        server_version, local_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)`,
      [
        id,
        input.farmId,
        input.saleDate,
        input.liters,
        input.pricePerLiter,
        input.fatPercent,
        input.proteinPercent,
        input.notes?.trim() || null,
        userId,
        timestamp,
        timestamp,
      ],
    );
    const row = driver.get<SaleRow>('SELECT * FROM milk_sales WHERE id = ?', [id]);
    if (!row) throw new Error('milk sale insert failed');
    enqueueMutation(driver, {
      farmId: input.farmId,
      entityType: 'milk_sale',
      entityId: id,
      operation: 'upsert',
      payload: salePayload(row),
    });
    return rowToSale(row);
  });
}

export function listMilkSales(driver: SqlDriver, farmId: string, limit = 90): MilkSale[] {
  return driver
    .all<SaleRow>(
      `SELECT * FROM milk_sales WHERE farm_id = ? AND deleted_at IS NULL
       ORDER BY sale_date DESC, created_at DESC LIMIT ?`,
      [farmId, limit],
    )
    .map(rowToSale);
}

export function softDeleteMilkSale(driver: SqlDriver, saleId: string): void {
  driver.transaction(() => {
    driver.run('UPDATE milk_sales SET deleted_at = ?, local_updated_at = ? WHERE id = ?', [
      nowIso(),
      nowIso(),
      saleId,
    ]);
    const row = driver.get<SaleRow>('SELECT * FROM milk_sales WHERE id = ?', [saleId]);
    if (!row) throw new DomainError('cow_not_found');
    enqueueMutation(driver, {
      farmId: row.farm_id,
      entityType: 'milk_sale',
      entityId: saleId,
      operation: 'upsert',
      payload: salePayload(row),
    });
  });
}

export interface MonthSalesSummary {
  /** YYYY-MM */
  month: string;
  liters: number;
  income: number;
}

/** Derived monthly settlement (liters and liters×price income). */
export function monthlySalesSummary(
  driver: SqlDriver,
  farmId: string,
  month: string,
): MonthSalesSummary {
  const row = driver.get<{ liters: number | null; income: number | null }>(
    `SELECT SUM(liters) AS liters, SUM(liters * price_per_liter) AS income
     FROM milk_sales
     WHERE farm_id = ? AND deleted_at IS NULL AND sale_date LIKE ?`,
    [farmId, `${month}-%`],
  );
  return { month, liters: row?.liters ?? 0, income: row?.income ?? 0 };
}

/** Applies a pulled remote row (no outbox entry). */
export function applyRemoteMilkSale(driver: SqlDriver, remote: Record<string, unknown>): void {
  driver.run(
    `INSERT OR REPLACE INTO milk_sales (
      id, farm_id, sale_date, liters, price_per_liter, fat_percent,
      protein_percent, notes, recorded_by, created_at, deleted_at,
      server_version, local_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(remote.id),
      String(remote.farm_id),
      String(remote.sale_date),
      Number(remote.liters),
      Number(remote.price_per_liter),
      remote.fat_percent === null || remote.fat_percent === undefined
        ? null
        : Number(remote.fat_percent),
      remote.protein_percent === null || remote.protein_percent === undefined
        ? null
        : Number(remote.protein_percent),
      (remote.notes as string | null) ?? null,
      String(remote.recorded_by),
      String(remote.created_at),
      (remote.deleted_at as string | null) ?? null,
      Number(remote.server_version ?? 0),
      nowIso(),
    ],
  );
}
