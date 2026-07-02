import type { SqlDriver } from '@/db/driver';
import { nowIso } from '@/lib/clock';
import { newId } from '@/lib/ids';
import {
  DomainError,
  normalizeTag,
  validateBirthDate,
  validateCalvingCount,
  validateCowName,
} from '@/lib/validation';
import { enqueueMutation } from '@/sync/outbox';
import type { Cow, LactationStatus, LifecycleStatus, PregnancyStatus } from '@/types/domain';

/**
 * Cow persistence. Every mutation writes the domain row and its outbox entry
 * in one transaction (CLAUDE.md non-negotiable). UI never issues SQL.
 */

interface CowRow {
  id: string;
  farm_id: string;
  name: string;
  tag_number: string | null;
  photo_path: string | null;
  photo_local_uri: string | null;
  birth_date: string | null;
  birth_date_is_estimated: number;
  breed: string | null;
  mother_id: string | null;
  calving_count: number;
  lifecycle_status: LifecycleStatus;
  lactation_status: LactationStatus;
  pregnancy_status: PregnancyStatus;
  created_by: string;
  created_at: string;
  deleted_at: string | null;
  server_version: number;
  local_updated_at: string;
}

function rowToCow(row: CowRow): Cow {
  return {
    id: row.id,
    farmId: row.farm_id,
    name: row.name,
    tagNumber: row.tag_number,
    photoPath: row.photo_path,
    photoLocalUri: row.photo_local_uri,
    birthDate: row.birth_date,
    birthDateIsEstimated: row.birth_date_is_estimated === 1,
    breed: row.breed,
    motherId: row.mother_id,
    calvingCount: row.calving_count,
    lifecycleStatus: row.lifecycle_status,
    lactationStatus: row.lactation_status,
    pregnancyStatus: row.pregnancy_status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

/** Remote-shaped snapshot pushed through the outbox. */
function cowPayload(row: CowRow): Record<string, unknown> {
  return {
    id: row.id,
    farm_id: row.farm_id,
    name: row.name,
    tag_number: row.tag_number,
    photo_path: row.photo_path,
    birth_date: row.birth_date,
    birth_date_is_estimated: row.birth_date_is_estimated === 1,
    breed: row.breed,
    mother_id: row.mother_id,
    calving_count: row.calving_count,
    lifecycle_status: row.lifecycle_status,
    lactation_status: row.lactation_status,
    pregnancy_status: row.pregnancy_status,
    created_by: row.created_by,
    created_at: row.created_at,
    deleted_at: row.deleted_at,
  };
}

export interface CowInput {
  farmId: string;
  name: string;
  tagNumber: string | null;
  photoLocalUri?: string | null;
  birthDate: string | null;
  birthDateIsEstimated: boolean;
  breed: string | null;
  motherId: string | null;
  calvingCount: number;
  lactationStatus: LactationStatus;
  pregnancyStatus: PregnancyStatus;
}

function getRow(driver: SqlDriver, cowId: string): CowRow | undefined {
  return driver.get<CowRow>('SELECT * FROM cows WHERE id = ?', [cowId]);
}

function assertTagAvailable(
  driver: SqlDriver,
  farmId: string,
  tag: string | null,
  excludeCowId?: string,
): void {
  if (tag === null) return;
  const existing = driver.get<{ id: string }>(
    `SELECT id FROM cows
     WHERE farm_id = ? AND deleted_at IS NULL AND tag_number IS NOT NULL
       AND lower(trim(tag_number)) = lower(trim(?))
       AND id <> ?`,
    [farmId, tag, excludeCowId ?? ''],
  );
  if (existing) throw new DomainError('duplicate_tag');
}

function assertValidMother(
  driver: SqlDriver,
  farmId: string,
  motherId: string | null,
  cowId?: string,
): void {
  if (motherId === null) return;
  if (cowId !== undefined && motherId === cowId) throw new DomainError('own_mother');
  const mother = driver.get<{ farm_id: string }>(
    'SELECT farm_id FROM cows WHERE id = ? AND deleted_at IS NULL',
    [motherId],
  );
  if (!mother) throw new DomainError('mother_not_found');
  if (mother.farm_id !== farmId) throw new DomainError('mother_other_farm');
}

export function createCow(driver: SqlDriver, input: CowInput, userId: string): Cow {
  const name = validateCowName(input.name);
  validateBirthDate(input.birthDate);
  validateCalvingCount(input.calvingCount);
  const tag = normalizeTag(input.tagNumber);
  const id = newId();
  const timestamp = nowIso();

  return driver.transaction(() => {
    assertTagAvailable(driver, input.farmId, tag);
    assertValidMother(driver, input.farmId, input.motherId, id);
    driver.run(
      `INSERT INTO cows (
        id, farm_id, name, tag_number, photo_path, photo_local_uri,
        birth_date, birth_date_is_estimated, breed, mother_id, calving_count,
        lifecycle_status, lactation_status, pregnancy_status,
        created_by, created_at, deleted_at, server_version, local_updated_at
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, NULL, 0, ?)`,
      [
        id,
        input.farmId,
        name,
        tag,
        input.photoLocalUri ?? null,
        input.birthDate,
        input.birthDateIsEstimated ? 1 : 0,
        input.breed,
        input.motherId,
        input.calvingCount,
        input.lactationStatus,
        input.pregnancyStatus,
        userId,
        timestamp,
        timestamp,
      ],
    );
    const row = getRow(driver, id);
    if (!row) throw new Error('cow insert failed');
    enqueueMutation(driver, {
      farmId: input.farmId,
      entityType: 'cow',
      entityId: id,
      operation: 'upsert',
      payload: cowPayload(row),
    });
    return rowToCow(row);
  });
}

export type CowPatch = Partial<Omit<CowInput, 'farmId'>>;

export function updateCow(driver: SqlDriver, cowId: string, patch: CowPatch): Cow {
  return driver.transaction(() => {
    const current = getRow(driver, cowId);
    if (!current || current.deleted_at !== null) throw new DomainError('cow_not_found');

    const name = patch.name !== undefined ? validateCowName(patch.name) : current.name;
    const birthDate = patch.birthDate !== undefined ? patch.birthDate : current.birth_date;
    validateBirthDate(birthDate);
    const calvingCount = patch.calvingCount ?? current.calving_count;
    validateCalvingCount(calvingCount);
    const tag = patch.tagNumber !== undefined ? normalizeTag(patch.tagNumber) : current.tag_number;
    assertTagAvailable(driver, current.farm_id, tag, cowId);
    const motherId = patch.motherId !== undefined ? patch.motherId : current.mother_id;
    assertValidMother(driver, current.farm_id, motherId, cowId);

    driver.run(
      `UPDATE cows SET
        name = ?, tag_number = ?, photo_local_uri = ?, birth_date = ?,
        birth_date_is_estimated = ?, breed = ?, mother_id = ?, calving_count = ?,
        lactation_status = ?, pregnancy_status = ?, local_updated_at = ?
       WHERE id = ?`,
      [
        name,
        tag,
        patch.photoLocalUri !== undefined ? patch.photoLocalUri : current.photo_local_uri,
        birthDate,
        (patch.birthDateIsEstimated ?? current.birth_date_is_estimated === 1) ? 1 : 0,
        patch.breed !== undefined ? patch.breed : current.breed,
        motherId,
        calvingCount,
        patch.lactationStatus ?? current.lactation_status,
        patch.pregnancyStatus ?? current.pregnancy_status,
        nowIso(),
        cowId,
      ],
    );
    const row = getRow(driver, cowId);
    if (!row) throw new Error('cow update failed');
    enqueueMutation(driver, {
      farmId: row.farm_id,
      entityType: 'cow',
      entityId: cowId,
      operation: 'upsert',
      payload: cowPayload(row),
    });
    return rowToCow(row);
  });
}

/**
 * Lifecycle deactivation is a business state change, not a delete (D-009).
 * The UI restricts this to owners; the server enforces it with RLS.
 */
export function setLifecycleStatus(driver: SqlDriver, cowId: string, status: LifecycleStatus): Cow {
  return driver.transaction(() => {
    const current = getRow(driver, cowId);
    if (!current || current.deleted_at !== null) throw new DomainError('cow_not_found');
    driver.run('UPDATE cows SET lifecycle_status = ?, local_updated_at = ? WHERE id = ?', [
      status,
      nowIso(),
      cowId,
    ]);
    const row = getRow(driver, cowId);
    if (!row) throw new Error('cow update failed');
    enqueueMutation(driver, {
      farmId: row.farm_id,
      entityType: 'cow',
      entityId: cowId,
      operation: 'upsert',
      payload: cowPayload(row),
    });
    return rowToCow(row);
  });
}

/** Soft delete: correction tombstone that must propagate (D-009). */
export function softDeleteCow(driver: SqlDriver, cowId: string): void {
  driver.transaction(() => {
    const current = getRow(driver, cowId);
    if (!current || current.deleted_at !== null) throw new DomainError('cow_not_found');
    driver.run('UPDATE cows SET deleted_at = ?, local_updated_at = ? WHERE id = ?', [
      nowIso(),
      nowIso(),
      cowId,
    ]);
    const row = getRow(driver, cowId);
    if (!row) throw new Error('cow delete failed');
    enqueueMutation(driver, {
      farmId: row.farm_id,
      entityType: 'cow',
      entityId: cowId,
      operation: 'upsert',
      payload: cowPayload(row),
    });
  });
}

/** Marks the remote photo path after a confirmed upload (Phase 5 photo queue). */
export function setCowPhotoPath(driver: SqlDriver, cowId: string, photoPath: string): void {
  driver.transaction(() => {
    const current = getRow(driver, cowId);
    if (!current) throw new DomainError('cow_not_found');
    driver.run(
      'UPDATE cows SET photo_path = ?, photo_local_uri = NULL, local_updated_at = ? WHERE id = ?',
      [photoPath, nowIso(), cowId],
    );
    const row = getRow(driver, cowId);
    if (!row) throw new Error('cow update failed');
    enqueueMutation(driver, {
      farmId: row.farm_id,
      entityType: 'cow',
      entityId: cowId,
      operation: 'upsert',
      payload: cowPayload(row),
    });
  });
}

export function getCow(driver: SqlDriver, cowId: string): Cow | null {
  const row = getRow(driver, cowId);
  return row && row.deleted_at === null ? rowToCow(row) : null;
}

export function listCows(driver: SqlDriver, farmId: string, search?: string): Cow[] {
  const term = search?.trim();
  if (term) {
    const like = `%${term.replace(/[%_]/g, (c) => `\\${c}`)}%`;
    return driver
      .all<CowRow>(
        `SELECT * FROM cows
         WHERE farm_id = ? AND deleted_at IS NULL
           AND (name LIKE ? ESCAPE '\\' OR tag_number LIKE ? ESCAPE '\\')
         ORDER BY name COLLATE NOCASE`,
        [farmId, like, like],
      )
      .map(rowToCow);
  }
  return driver
    .all<CowRow>(
      `SELECT * FROM cows WHERE farm_id = ? AND deleted_at IS NULL
       ORDER BY name COLLATE NOCASE`,
      [farmId],
    )
    .map(rowToCow);
}

export function listDaughters(driver: SqlDriver, cowId: string): Cow[] {
  return driver
    .all<CowRow>(
      `SELECT * FROM cows WHERE mother_id = ? AND deleted_at IS NULL
       ORDER BY name COLLATE NOCASE`,
      [cowId],
    )
    .map(rowToCow);
}

/** Applies a pulled remote row (no outbox entry — it came from the server). */
export function applyRemoteCow(driver: SqlDriver, remote: Record<string, unknown>): void {
  const local = driver.get<{ photo_local_uri: string | null }>(
    'SELECT photo_local_uri FROM cows WHERE id = ?',
    [String(remote.id)],
  );
  driver.run(
    `INSERT OR REPLACE INTO cows (
      id, farm_id, name, tag_number, photo_path, photo_local_uri,
      birth_date, birth_date_is_estimated, breed, mother_id, calving_count,
      lifecycle_status, lactation_status, pregnancy_status,
      created_by, created_at, deleted_at, server_version, local_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(remote.id),
      String(remote.farm_id),
      String(remote.name),
      (remote.tag_number as string | null) ?? null,
      (remote.photo_path as string | null) ?? null,
      local?.photo_local_uri ?? null,
      (remote.birth_date as string | null) ?? null,
      remote.birth_date_is_estimated ? 1 : 0,
      (remote.breed as string | null) ?? null,
      (remote.mother_id as string | null) ?? null,
      Number(remote.calving_count ?? 0),
      String(remote.lifecycle_status) as LifecycleStatus,
      String(remote.lactation_status) as LactationStatus,
      String(remote.pregnancy_status) as PregnancyStatus,
      String(remote.created_by),
      String(remote.created_at),
      (remote.deleted_at as string | null) ?? null,
      Number(remote.server_version ?? 0),
      nowIso(),
    ],
  );
}
