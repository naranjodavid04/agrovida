import type { SupabaseClient } from '@supabase/supabase-js';

import type { PhotoUploader } from './photos';

const BUCKET = 'cow-photos';

/**
 * Uploads an app-owned local file to the private cow-photos bucket. Images
 * are already resized/compressed when picked (see the cow form), so this
 * only streams bytes.
 */
export function createSupabasePhotoUploader(client: SupabaseClient): PhotoUploader {
  return {
    async upload(localUri: string, storagePath: string): Promise<void> {
      const response = await fetch(localUri);
      const bytes = await response.arrayBuffer();
      const { error } = await client.storage.from(BUCKET).upload(storagePath, bytes, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (error) throw error;
    },
  };
}
