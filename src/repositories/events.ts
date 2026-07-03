import type { SqlDriver } from '@/db/driver';
import { nowIso } from '@/lib/clock';
import { GESTATION_DAYS } from '@/lib/constants';
import { addDaysIso } from '@/lib/dates';
import { newId } from '@/lib/ids';
import { DomainError, validateRecordDate } from '@/lib/validation';
import { enqueueMutation } from '@/sync/outbox';
import type {
  HealthEvent,
  HealthEventType,
  PregnancyCheckResult,
  ReproEvent,
  ReproEventType,
} from '@/types/domain';

/**
 * Health and reproduction events (D-019). Same transactional-outbox contract
 * as the rest of the domain. Expected calving is always derived from the
 * last open insemination — never stored.
 */

interface HealthRow {
  id: string;
  farm_id: string;
  cow_id: string;
  event_date: string;
  event_type: HealthEventType;
  description: string;
  withdrawal_until: string | null;
  recorded_by: string;
  created_at: string;
  deleted_at: string | null;
  server_version: number;
  local_updated_at: string;
}

interface ReproRow {
  id: string;
  farm_id: string;
  cow_id: string;
  event_date: string;
  event_type: ReproEventType;
  result: PregnancyCheckResult | null;
  notes: string | null;
  recorded_by: string;
  created_at: string;
  deleted_at: string | null;
  server_version: number;
  local_updated_at: string;
}

function healthRowToEvent(row: HealthRow): HealthEvent {
  return {
    id: row.id,
    farmId: row.farm_id,
    cowId: row.cow_id,
    eventDate: row.event_date,
    eventType: row.event_type,
    description: row.description,
    withdrawalUntil: row.withdrawal_until,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

function reproRowToEvent(row: ReproRow): ReproEvent {
  return {
    id: row.id,
    farmId: row.farm_id,
    cowId: row.cow_id,
    eventDate: row.event_date,
    eventType: row.event_type,
    result: row.result,
    notes: row.notes,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

function healthPayload(row: HealthRow): Record<string, unknown> {
  return {
    id: row.id,
    farm_id: row.farm_id,
    cow_id: row.cow_id,
    event_date: row.event_date,
    event_type: row.event_type,
    description: row.description,
    withdrawal_until: row.withdrawal_until,
    recorded_by: row.recorded_by,
    created_at: row.created_at,
    deleted_at: row.deleted_at,
  };
}

function reproPayload(row: ReproRow): Record<string, unknown> {
  return {
    id: row.id,
    farm_id: row.farm_id,
    cow_id: row.cow_id,
    event_date: row.event_date,
    event_type: row.event_type,
    result: row.result,
    notes: row.notes,
    recorded_by: row.recorded_by,
    created_at: row.created_at,
    deleted_at: row.deleted_at,
  };
}

function assertActiveCow(driver: SqlDriver, farmId: string, cowId: string): void {
  const cow = driver.get<{ farm_id: string; deleted_at: string | null }>(
    'SELECT farm_id, deleted_at FROM cows WHERE id = ?',
    [cowId],
  );
  if (!cow || cow.deleted_at !== null || cow.farm_id !== farmId) {
    throw new DomainError('cow_not_found');
  }
}

export interface HealthEventInput {
  farmId: string;
  cowId: string;
  eventDate: string;
  eventType: HealthEventType;
  description: string;
  withdrawalUntil: string | null;
}

export function createHealthEvent(
  driver: SqlDriver,
  input: HealthEventInput,
  userId: string,
): HealthEvent {
  validateRecordDate(input.eventDate);
  if (input.withdrawalUntil !== null) validateRecordDate(input.withdrawalUntil);
  const description = input.description.trim();
  if (description.length === 0 || description.length > 500) {
    throw new DomainError('name_required', 'description required');
  }
  const id = newId();
  const timestamp = nowIso();

  return driver.transaction(() => {
    assertActiveCow(driver, input.farmId, input.cowId);
    driver.run(
      `INSERT INTO health_events (
        id, farm_id, cow_id, event_date, event_type, description,
        withdrawal_until, recorded_by, created_at, deleted_at,
        server_version, local_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)`,
      [
        id,
        input.farmId,
        input.cowId,
        input.eventDate,
        input.eventType,
        description,
        input.withdrawalUntil,
        userId,
        timestamp,
        timestamp,
      ],
    );
    const row = driver.get<HealthRow>('SELECT * FROM health_events WHERE id = ?', [id]);
    if (!row) throw new Error('health event insert failed');
    enqueueMutation(driver, {
      farmId: input.farmId,
      entityType: 'health_event',
      entityId: id,
      operation: 'upsert',
      payload: healthPayload(row),
    });
    return healthRowToEvent(row);
  });
}

export interface ReproEventInput {
  farmId: string;
  cowId: string;
  eventDate: string;
  eventType: ReproEventType;
  result: PregnancyCheckResult | null;
  notes: string | null;
}

export function createReproEvent(
  driver: SqlDriver,
  input: ReproEventInput,
  userId: string,
): ReproEvent {
  validateRecordDate(input.eventDate);
  const id = newId();
  const timestamp = nowIso();

  return driver.transaction(() => {
    assertActiveCow(driver, input.farmId, input.cowId);
    driver.run(
      `INSERT INTO repro_events (
        id, farm_id, cow_id, event_date, event_type, result, notes,
        recorded_by, created_at, deleted_at, server_version, local_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)`,
      [
        id,
        input.farmId,
        input.cowId,
        input.eventDate,
        input.eventType,
        input.eventType === 'pregnancy_check' ? input.result : null,
        input.notes?.trim() || null,
        userId,
        timestamp,
        timestamp,
      ],
    );
    const row = driver.get<ReproRow>('SELECT * FROM repro_events WHERE id = ?', [id]);
    if (!row) throw new Error('repro event insert failed');
    enqueueMutation(driver, {
      farmId: input.farmId,
      entityType: 'repro_event',
      entityId: id,
      operation: 'upsert',
      payload: reproPayload(row),
    });
    return reproRowToEvent(row);
  });
}

export function listHealthEvents(driver: SqlDriver, cowId: string, limit = 60): HealthEvent[] {
  return driver
    .all<HealthRow>(
      `SELECT * FROM health_events WHERE cow_id = ? AND deleted_at IS NULL
       ORDER BY event_date DESC, created_at DESC LIMIT ?`,
      [cowId, limit],
    )
    .map(healthRowToEvent);
}

export function listReproEvents(driver: SqlDriver, cowId: string, limit = 60): ReproEvent[] {
  return driver
    .all<ReproRow>(
      `SELECT * FROM repro_events WHERE cow_id = ? AND deleted_at IS NULL
       ORDER BY event_date DESC, created_at DESC LIMIT ?`,
      [cowId, limit],
    )
    .map(reproRowToEvent);
}

export function softDeleteHealthEvent(driver: SqlDriver, eventId: string): void {
  driver.transaction(() => {
    driver.run('UPDATE health_events SET deleted_at = ?, local_updated_at = ? WHERE id = ?', [
      nowIso(),
      nowIso(),
      eventId,
    ]);
    const row = driver.get<HealthRow>('SELECT * FROM health_events WHERE id = ?', [eventId]);
    if (!row) throw new DomainError('cow_not_found');
    enqueueMutation(driver, {
      farmId: row.farm_id,
      entityType: 'health_event',
      entityId: eventId,
      operation: 'upsert',
      payload: healthPayload(row),
    });
  });
}

export function softDeleteReproEvent(driver: SqlDriver, eventId: string): void {
  driver.transaction(() => {
    driver.run('UPDATE repro_events SET deleted_at = ?, local_updated_at = ? WHERE id = ?', [
      nowIso(),
      nowIso(),
      eventId,
    ]);
    const row = driver.get<ReproRow>('SELECT * FROM repro_events WHERE id = ?', [eventId]);
    if (!row) throw new DomainError('cow_not_found');
    enqueueMutation(driver, {
      farmId: row.farm_id,
      entityType: 'repro_event',
      entityId: eventId,
      operation: 'upsert',
      payload: reproPayload(row),
    });
  });
}

// ---------------------------------------------------------------------------
// Derived values (never stored)
// ---------------------------------------------------------------------------

/** Active milk-withdrawal end date for the cow, or null (isoDate inclusive). */
export function activeWithdrawalUntil(
  driver: SqlDriver,
  cowId: string,
  isoDate: string,
): string | null {
  const row = driver.get<{ withdrawal_until: string }>(
    `SELECT withdrawal_until FROM health_events
     WHERE cow_id = ? AND deleted_at IS NULL
       AND withdrawal_until IS NOT NULL AND withdrawal_until >= ?
     ORDER BY withdrawal_until DESC LIMIT 1`,
    [cowId, isoDate],
  );
  return row?.withdrawal_until ?? null;
}

/**
 * Expected calving date: last insemination + GESTATION_DAYS, unless a later
 * calving/abortion or an 'open' pregnancy check closed that cycle.
 */
export function expectedCalvingDate(driver: SqlDriver, cowId: string): string | null {
  const insemination = driver.get<{ event_date: string }>(
    `SELECT event_date FROM repro_events
     WHERE cow_id = ? AND deleted_at IS NULL AND event_type = 'insemination'
     ORDER BY event_date DESC LIMIT 1`,
    [cowId],
  );
  if (!insemination) return null;
  const cycleClosed = driver.get<{ id: string }>(
    `SELECT id FROM repro_events
     WHERE cow_id = ? AND deleted_at IS NULL
       AND event_date >= ?
       AND (event_type IN ('calving', 'abortion')
            OR (event_type = 'pregnancy_check' AND result = 'open'))
     LIMIT 1`,
    [cowId, insemination.event_date],
  );
  if (cycleClosed) return null;
  return addDaysIso(insemination.event_date, GESTATION_DAYS);
}

// ---------------------------------------------------------------------------
// Remote application (pull feed)
// ---------------------------------------------------------------------------

export function applyRemoteHealthEvent(driver: SqlDriver, remote: Record<string, unknown>): void {
  driver.run(
    `INSERT OR REPLACE INTO health_events (
      id, farm_id, cow_id, event_date, event_type, description,
      withdrawal_until, recorded_by, created_at, deleted_at,
      server_version, local_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(remote.id),
      String(remote.farm_id),
      String(remote.cow_id),
      String(remote.event_date),
      String(remote.event_type) as HealthEventType,
      String(remote.description),
      (remote.withdrawal_until as string | null) ?? null,
      String(remote.recorded_by),
      String(remote.created_at),
      (remote.deleted_at as string | null) ?? null,
      Number(remote.server_version ?? 0),
      nowIso(),
    ],
  );
}

export function applyRemoteReproEvent(driver: SqlDriver, remote: Record<string, unknown>): void {
  driver.run(
    `INSERT OR REPLACE INTO repro_events (
      id, farm_id, cow_id, event_date, event_type, result, notes,
      recorded_by, created_at, deleted_at, server_version, local_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(remote.id),
      String(remote.farm_id),
      String(remote.cow_id),
      String(remote.event_date),
      String(remote.event_type) as ReproEventType,
      (remote.result as PregnancyCheckResult | null) ?? null,
      (remote.notes as string | null) ?? null,
      String(remote.recorded_by),
      String(remote.created_at),
      (remote.deleted_at as string | null) ?? null,
      Number(remote.server_version ?? 0),
      nowIso(),
    ],
  );
}
