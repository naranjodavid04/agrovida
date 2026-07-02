import type { SqlDriver } from '@/db/driver';
import { nowIso } from '@/lib/clock';

/**
 * Independent photo upload queue (D-010): a failed photo upload never blocks
 * cow or milk synchronization.
 */

export interface PhotoUploadJob {
  id: number;
  farm_id: string;
  cow_id: string;
  local_uri: string;
  storage_path: string;
  status: 'pending' | 'uploaded' | 'failed';
  attempt_count: number;
  last_error: string | null;
  next_attempt_at: string | null;
  created_at: string;
}

export function enqueuePhotoUpload(
  driver: SqlDriver,
  farmId: string,
  cowId: string,
  localUri: string,
): PhotoUploadJob {
  const storagePath = `${farmId}/cows/${cowId}/${Date.now()}.jpg`;
  driver.run(
    `INSERT INTO photo_upload_queue (farm_id, cow_id, local_uri, storage_path, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [farmId, cowId, localUri, storagePath, nowIso()],
  );
  const job = driver.get<PhotoUploadJob>(
    'SELECT * FROM photo_upload_queue WHERE rowid = last_insert_rowid()',
  );
  if (!job) throw new Error('photo enqueue failed');
  return job;
}

export function listDuePhotoUploads(
  driver: SqlDriver,
  farmId: string,
  asOfIso: string,
  limit = 10,
): PhotoUploadJob[] {
  return driver.all<PhotoUploadJob>(
    `SELECT * FROM photo_upload_queue
     WHERE farm_id = ? AND status IN ('pending', 'failed')
       AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
     ORDER BY id LIMIT ?`,
    [farmId, asOfIso, limit],
  );
}

export function markPhotoUploaded(driver: SqlDriver, jobId: number): void {
  driver.run(`UPDATE photo_upload_queue SET status = 'uploaded' WHERE id = ?`, [jobId]);
}

export function markPhotoFailed(
  driver: SqlDriver,
  jobId: number,
  error: string,
  nextAttemptAtIso: string,
): void {
  driver.run(
    `UPDATE photo_upload_queue
     SET status = 'failed', attempt_count = attempt_count + 1,
         last_error = ?, next_attempt_at = ?
     WHERE id = ?`,
    [error.slice(0, 500), nextAttemptAtIso, jobId],
  );
}
