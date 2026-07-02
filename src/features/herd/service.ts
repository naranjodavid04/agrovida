import type { SqlDriver } from '@/db/driver';
import { createCow, updateCow, type CowInput, type CowPatch } from '@/repositories/cows';
import { enqueuePhotoUpload } from '@/repositories/photoQueue';
import type { Cow } from '@/types/domain';

/**
 * Herd write use cases. A new photo enqueues its upload job in the same
 * transaction as the cow write, so a crash cannot leave a photo without its
 * queue entry (D-010).
 */

export function saveNewCow(
  driver: SqlDriver,
  input: CowInput,
  userId: string,
  newPhotoUri: string | null,
): Cow {
  return driver.transaction(() => {
    const cow = createCow(driver, { ...input, photoLocalUri: newPhotoUri }, userId);
    if (newPhotoUri) enqueuePhotoUpload(driver, input.farmId, cow.id, newPhotoUri);
    return cow;
  });
}

export function saveCowEdits(
  driver: SqlDriver,
  cowId: string,
  patch: CowPatch,
  newPhotoUri: string | null,
): Cow {
  return driver.transaction(() => {
    const cow = updateCow(
      driver,
      cowId,
      newPhotoUri ? { ...patch, photoLocalUri: newPhotoUri } : patch,
    );
    if (newPhotoUri) enqueuePhotoUpload(driver, cow.farmId, cow.id, newPhotoUri);
    return cow;
  });
}
