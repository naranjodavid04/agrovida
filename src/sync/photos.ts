import type { SqlDriver } from '@/db/driver';
import { now, nowIso } from '@/lib/clock';
import { createLogger } from '@/lib/logger';
import { setCowPhotoPath } from '@/repositories/cows';
import { listDuePhotoUploads, markPhotoFailed, markPhotoUploaded } from '@/repositories/photoQueue';

import { nextAttemptIso } from './backoff';

/**
 * Photo upload worker (D-010). Runs independently from the data cycle so a
 * failed upload never blocks cow or milk synchronization. On success the
 * cow's remote photo_path is updated through the normal outbox flow.
 */

const log = createLogger('sync:photos');

export interface PhotoUploader {
  upload(localUri: string, storagePath: string): Promise<void>;
}

export interface PhotoRunResult {
  uploaded: number;
  failed: number;
}

export async function runPhotoUploads(
  driver: SqlDriver,
  uploader: PhotoUploader,
  farmId: string,
): Promise<PhotoRunResult> {
  const result: PhotoRunResult = { uploaded: 0, failed: 0 };
  const jobs = listDuePhotoUploads(driver, farmId, nowIso());
  for (const job of jobs) {
    try {
      await uploader.upload(job.local_uri, job.storage_path);
      driver.transaction(() => {
        markPhotoUploaded(driver, job.id);
        setCowPhotoPath(driver, job.cow_id, job.storage_path);
      });
      result.uploaded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      markPhotoFailed(driver, job.id, message, nextAttemptIso(job.attempt_count, now()));
      result.failed += 1;
      log.warn('photo upload failed; scheduled retry', { jobId: job.id });
    }
  }
  return result;
}
