import type { SupabaseClient } from '@supabase/supabase-js';
import { File } from 'expo-file-system';

import { createLogger } from '@/lib/logger';

import type { PhotoUploader } from './photos';

const log = createLogger('sync:photo-upload');
const BUCKET = 'cow-photos';

/**
 * Uploads an app-owned local file to the private cow-photos bucket. Reads
 * bytes through expo-file-system (fetch on file:// URIs is unreliable in
 * React Native). Images are already resized/compressed when picked.
 */
export function createSupabasePhotoUploader(client: SupabaseClient): PhotoUploader {
  return {
    async upload(localUri: string, storagePath: string): Promise<void> {
      const file = new File(localUri);
      if (!file.exists) throw new Error(`local photo missing: ${localUri}`);
      const bytes = await file.bytes();
      const body = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      log.info('uploading photo', { storagePath, size: bytes.byteLength });
      const { error } = await client.storage.from(BUCKET).upload(storagePath, body, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (error) throw error;
      log.info('photo uploaded', { storagePath });
    },
  };
}
