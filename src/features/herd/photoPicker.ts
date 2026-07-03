import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { createLogger } from '@/lib/logger';
import { strings } from '@/lib/i18n/strings';

const log = createLogger('herd:photo');

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.7;

export class PhotoPermissionError extends Error {
  constructor() {
    super(strings.herd.photoPermissionDenied);
    this.name = 'PhotoPermissionError';
  }
}

async function ensurePermission(source: 'camera' | 'library'): Promise<void> {
  const current =
    source === 'camera'
      ? await ImagePicker.getCameraPermissionsAsync()
      : await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return;
  const requested =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!requested.granted) throw new PhotoPermissionError();
}

/** App-owned folder that survives cache cleanup while uploads are pending. */
function stableTargetFile(): File {
  const photosDir = new Directory(Paths.document, 'cow-photos');
  if (!photosDir.exists) photosDir.create({ intermediates: true });
  return new File(photosDir, `${Date.now()}.jpg`);
}

/**
 * Picks a photo (camera or gallery), compresses/resizes it, and copies it
 * into app-controlled storage (ARCHITECTURE §6). If compression fails on a
 * device, it falls back to copying the original image so the photo is never
 * lost. Returns the stable local URI, or null if the user cancelled.
 */
export async function pickCowPhoto(source: 'camera' | 'library'): Promise<string | null> {
  await ensurePermission(source);

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: 'images',
    quality: 1,
    allowsEditing: true,
    aspect: [16, 9],
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) {
    log.info('photo pick cancelled');
    return null;
  }

  const asset = result.assets[0];
  log.info('photo picked', { width: asset.width, height: asset.height });
  const target = stableTargetFile();

  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(asset.width, asset.height));
    const context = ImageManipulator.manipulate(asset.uri);
    if (scale < 1) {
      context.resize({ width: Math.round(asset.width * scale) });
    }
    const rendered = await context.renderAsync();
    const compressed = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: JPEG_QUALITY,
    });
    new File(compressed.uri).move(target);
    log.info('photo compressed and stored', { uri: target.uri });
  } catch (error) {
    // Never lose the photo because of a compression failure: keep the
    // original file instead (larger upload, same behavior).
    log.warn('photo compression failed; storing original', {
      message: error instanceof Error ? error.message : String(error),
    });
    new File(asset.uri).copy(target);
    log.info('original photo stored', { uri: target.uri });
  }
  return target.uri;
}
