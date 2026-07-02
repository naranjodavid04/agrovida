import type { SqlDriver } from '@/db/driver';
import { nowIso } from '@/lib/clock';
import { TREND_DAYS } from '@/lib/constants';
import { addDaysIso } from '@/lib/dates';
import { newId } from '@/lib/ids';
import { DomainError, validateLiters, validateRecordDate } from '@/lib/validation';
import { enqueueMutation } from '@/sync/outbox';
import type { MilkRecord, MilkSession } from '@/types/domain';

/**
 * Milk records: one active record per farm/cow/date/session. Totals, deltas,
 * and trends are always derived here — never stored on cows (D-007).
 */

interface MilkRow {
  id: string;
  farm_id: string;
  cow_id: string;
  record_date: string;
  session: MilkSession;
  liters: number;
  recorded_by: string;
  created_at: string;
  deleted_at: string | null;
  server_version: number;
  local_updated_at: string;
}

function rowToRecord(row: MilkRow): MilkRecord {
  return {
    id: row.id,
    farmId: row.farm_id,
    cowId: row.cow_id,
    recordDate: row.record_date,
    session: row.session,
    liters: row.liters,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

function milkPayload(row: MilkRow): Record<string, unknown> {
  return {
    id: row.id,
    farm_id: row.farm_id,
    cow_id: row.cow_id,
    record_date: row.record_date,
    session: row.session,
    liters: row.liters,
    recorded_by: row.recorded_by,
    created_at: row.created_at,
    deleted_at: row.deleted_at,
  };
}

export interface MilkInput {
  farmId: string;
  cowId: string;
  recordDate: string;
  session: MilkSession;
  liters: number;
}

/**
 * Creates or edits the single active record for the cow/date/session
 * (PRODUCT_SPEC §3: "create or edit one morning and one afternoon record").
 */
export function upsertMilkRecord(driver: SqlDriver, input: MilkInput, userId: string): MilkRecord {
  validateLiters(input.liters);
  validateRecordDate(input.recordDate);
  if (input.session !== 'morning' && input.session !== 'afternoon') {
    throw new DomainError('invalid_session');
  }

  return driver.transaction(() => {
    const cow = driver.get<{ farm_id: string; deleted_at: string | null }>(
      'SELECT farm_id, deleted_at FROM cows WHERE id = ?',
      [input.cowId],
    );
    if (!cow || cow.deleted_at !== null || cow.farm_id !== input.farmId) {
      throw new DomainError('cow_not_found');
    }

    const existing = driver.get<MilkRow>(
      `SELECT * FROM milk_records
       WHERE farm_id = ? AND cow_id = ? AND record_date = ? AND session = ?
         AND deleted_at IS NULL`,
      [input.farmId, input.cowId, input.recordDate, input.session],
    );

    let id: string;
    if (existing) {
      id = existing.id;
      driver.run('UPDATE milk_records SET liters = ?, local_updated_at = ? WHERE id = ?', [
        input.liters,
        nowIso(),
        id,
      ]);
    } else {
      id = newId();
      const timestamp = nowIso();
      driver.run(
        `INSERT INTO milk_records (
          id, farm_id, cow_id, record_date, session, liters,
          recorded_by, created_at, deleted_at, server_version, local_updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)`,
        [
          id,
          input.farmId,
          input.cowId,
          input.recordDate,
          input.session,
          input.liters,
          userId,
          timestamp,
          timestamp,
        ],
      );
    }

    const row = driver.get<MilkRow>('SELECT * FROM milk_records WHERE id = ?', [id]);
    if (!row) throw new Error('milk record write failed');
    enqueueMutation(driver, {
      farmId: input.farmId,
      entityType: 'milk_record',
      entityId: id,
      operation: 'upsert',
      payload: milkPayload(row),
    });
    return rowToRecord(row);
  });
}

/** Soft delete for corrections; propagates as a tombstone (D-009). */
export function softDeleteMilkRecord(driver: SqlDriver, recordId: string): void {
  driver.transaction(() => {
    const current = driver.get<MilkRow>('SELECT * FROM milk_records WHERE id = ?', [recordId]);
    if (!current || current.deleted_at !== null) throw new DomainError('cow_not_found');
    driver.run('UPDATE milk_records SET deleted_at = ?, local_updated_at = ? WHERE id = ?', [
      nowIso(),
      nowIso(),
      recordId,
    ]);
    const row = driver.get<MilkRow>('SELECT * FROM milk_records WHERE id = ?', [recordId]);
    if (!row) throw new Error('milk record delete failed');
    enqueueMutation(driver, {
      farmId: row.farm_id,
      entityType: 'milk_record',
      entityId: recordId,
      operation: 'upsert',
      payload: milkPayload(row),
    });
  });
}

export function getMilkRecord(
  driver: SqlDriver,
  farmId: string,
  cowId: string,
  recordDate: string,
  session: MilkSession,
): MilkRecord | null {
  const row = driver.get<MilkRow>(
    `SELECT * FROM milk_records
     WHERE farm_id = ? AND cow_id = ? AND record_date = ? AND session = ?
       AND deleted_at IS NULL`,
    [farmId, cowId, recordDate, session],
  );
  return row ? rowToRecord(row) : null;
}

export function listMilkHistory(driver: SqlDriver, cowId: string, limit = 60): MilkRecord[] {
  return driver
    .all<MilkRow>(
      `SELECT * FROM milk_records
       WHERE cow_id = ? AND deleted_at IS NULL
       ORDER BY record_date DESC, session DESC
       LIMIT ?`,
      [cowId, limit],
    )
    .map(rowToRecord);
}

// ---------------------------------------------------------------------------
// Derived values (D-007)
// ---------------------------------------------------------------------------

export function totalForCowOnDate(driver: SqlDriver, cowId: string, isoDate: string): number {
  const row = driver.get<{ total: number | null }>(
    `SELECT SUM(liters) AS total FROM milk_records
     WHERE cow_id = ? AND record_date = ? AND deleted_at IS NULL`,
    [cowId, isoDate],
  );
  return row?.total ?? 0;
}

export interface DayDelta {
  today: number;
  yesterday: number | null;
  delta: number | null;
}

/** Yesterday is null (no comparison) when it has no records at all. */
export function dayDeltaForCow(driver: SqlDriver, cowId: string, isoDate: string): DayDelta {
  const today = totalForCowOnDate(driver, cowId, isoDate);
  const yesterdayDate = addDaysIso(isoDate, -1);
  const row = driver.get<{ n: number; total: number | null }>(
    `SELECT COUNT(*) AS n, SUM(liters) AS total FROM milk_records
     WHERE cow_id = ? AND record_date = ? AND deleted_at IS NULL`,
    [cowId, yesterdayDate],
  );
  const yesterday = (row?.n ?? 0) > 0 ? (row?.total ?? 0) : null;
  return { today, yesterday, delta: yesterday === null ? null : today - yesterday };
}

export interface TrendPoint {
  date: string;
  total: number;
}

/** Daily totals for the TREND_DAYS window ending at `endDate` (inclusive). */
export function sevenDayTrendForCow(
  driver: SqlDriver,
  cowId: string,
  endDate: string,
): TrendPoint[] {
  const startDate = addDaysIso(endDate, -(TREND_DAYS - 1));
  const rows = driver.all<{ record_date: string; total: number }>(
    `SELECT record_date, SUM(liters) AS total FROM milk_records
     WHERE cow_id = ? AND record_date >= ? AND record_date <= ? AND deleted_at IS NULL
     GROUP BY record_date`,
    [cowId, startDate, endDate],
  );
  const byDate = new Map(rows.map((r) => [r.record_date, r.total]));
  const points: TrendPoint[] = [];
  for (let i = 0; i < TREND_DAYS; i += 1) {
    const date = addDaysIso(startDate, i);
    points.push({ date, total: byDate.get(date) ?? 0 });
  }
  return points;
}

export function farmTotalForDate(driver: SqlDriver, farmId: string, isoDate: string): number {
  const row = driver.get<{ total: number | null }>(
    `SELECT SUM(liters) AS total FROM milk_records
     WHERE farm_id = ? AND record_date = ? AND deleted_at IS NULL`,
    [farmId, isoDate],
  );
  return row?.total ?? 0;
}

export function farmSevenDayTrend(
  driver: SqlDriver,
  farmId: string,
  endDate: string,
): TrendPoint[] {
  const startDate = addDaysIso(endDate, -(TREND_DAYS - 1));
  const rows = driver.all<{ record_date: string; total: number }>(
    `SELECT record_date, SUM(liters) AS total FROM milk_records
     WHERE farm_id = ? AND record_date >= ? AND record_date <= ? AND deleted_at IS NULL
     GROUP BY record_date`,
    [farmId, startDate, endDate],
  );
  const byDate = new Map(rows.map((r) => [r.record_date, r.total]));
  const points: TrendPoint[] = [];
  for (let i = 0; i < TREND_DAYS; i += 1) {
    const date = addDaysIso(startDate, i);
    points.push({ date, total: byDate.get(date) ?? 0 });
  }
  return points;
}

/** Applies a pulled remote row (no outbox entry). */
export function applyRemoteMilkRecord(driver: SqlDriver, remote: Record<string, unknown>): void {
  driver.run(
    `INSERT OR REPLACE INTO milk_records (
      id, farm_id, cow_id, record_date, session, liters,
      recorded_by, created_at, deleted_at, server_version, local_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(remote.id),
      String(remote.farm_id),
      String(remote.cow_id),
      String(remote.record_date),
      String(remote.session) as MilkSession,
      Number(remote.liters),
      String(remote.recorded_by),
      String(remote.created_at),
      (remote.deleted_at as string | null) ?? null,
      Number(remote.server_version ?? 0),
      nowIso(),
    ],
  );
}
