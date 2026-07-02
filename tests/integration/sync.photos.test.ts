import type { SqlDriver } from '@/db/driver';
import { createCow, getCow } from '@/repositories/cows';
import { enqueuePhotoUpload, listDuePhotoUploads } from '@/repositories/photoQueue';
import { countPendingMutations } from '@/sync/outbox';
import { runPhotoUploads, type PhotoUploader } from '@/sync/photos';

import { createMigratedTestDb, seedFarm } from '../helpers/testDb';

const FARM = 'farm-1';

describe('photo upload queue (D-010)', () => {
  let driver: SqlDriver;
  let cowId: string;

  beforeEach(() => {
    driver = createMigratedTestDb();
    seedFarm(driver, FARM, 'user-1');
    cowId = createCow(
      driver,
      {
        farmId: FARM,
        name: 'Lola',
        tagNumber: 'A-01',
        photoLocalUri: 'file:///photos/lola.jpg',
        birthDate: null,
        birthDateIsEstimated: false,
        breed: null,
        motherId: null,
        calvingCount: 0,
        lactationStatus: 'unknown',
        pregnancyStatus: 'unknown',
      },
      'user-1',
    ).id;
  });

  afterEach(() => driver.close());

  it('marks the job uploaded and updates the cow photo path through the outbox', async () => {
    const job = enqueuePhotoUpload(driver, FARM, cowId, 'file:///photos/lola.jpg');
    expect(job.storage_path).toMatch(new RegExp(`^${FARM}/cows/${cowId}/\\d+\\.jpg$`));

    const uploads: string[] = [];
    const uploader: PhotoUploader = {
      upload: async (localUri, storagePath) => {
        uploads.push(`${localUri} -> ${storagePath}`);
      },
    };
    const pendingBefore = countPendingMutations(driver, FARM);
    const result = await runPhotoUploads(driver, uploader, FARM);

    expect(result).toEqual({ uploaded: 1, failed: 0 });
    expect(uploads).toHaveLength(1);
    expect(listDuePhotoUploads(driver, FARM, '2999-01-01')).toHaveLength(0);
    // Cow now references the stable storage path and queued a cow upsert.
    const cow = getCow(driver, cowId);
    expect(cow?.photoPath).toBe(job.storage_path);
    expect(cow?.photoLocalUri).toBeNull();
    expect(countPendingMutations(driver, FARM)).toBe(pendingBefore + 1);
  });

  it('a failed upload backs off without touching cow data (never blocks sync)', async () => {
    enqueuePhotoUpload(driver, FARM, cowId, 'file:///photos/lola.jpg');
    const uploader: PhotoUploader = {
      upload: async () => {
        throw new Error('storage unreachable');
      },
    };
    const result = await runPhotoUploads(driver, uploader, FARM);
    expect(result).toEqual({ uploaded: 0, failed: 1 });

    // Not due immediately (backoff), but still queued for later.
    expect(listDuePhotoUploads(driver, FARM, new Date().toISOString())).toHaveLength(0);
    const later = listDuePhotoUploads(driver, FARM, '2999-01-01');
    expect(later).toHaveLength(1);
    expect(later[0]?.status).toBe('failed');
    expect(later[0]?.last_error).toContain('storage unreachable');

    // Cow keeps showing the local photo while the upload is pending.
    const cow = getCow(driver, cowId);
    expect(cow?.photoPath).toBeNull();
    expect(cow?.photoLocalUri).toBe('file:///photos/lola.jpg');
  });
});
