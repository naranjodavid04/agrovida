import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { createLogger } from '@/lib/logger';

const log = createLogger('herd:photo');

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.7;

/**
 * Picks a photo (camera or gallery), compresses/resizes it, and copies it
 * into app-controlled storage so it survives cache cleanup while the upload
 * is pending (ARCHITECTURE §6). Returns the stable local URI, or null if the
 * user cancelled.
 */
export async function pickCowPhoto(source: 'camera' | 'library'): Promise<string | null> {
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
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const scale = Math.min(1, MAX_DIMENSION / Math.max(asset.width, asset.height));
  const context = ImageManipulator.manipulate(asset.uri);
  if (scale < 1) {
    context.resize({ width: Math.round(asset.width * scale) });
  }
  const rendered = await context.renderAsync();
  const compressed = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });

  const photosDir = new Directory(Paths.document, 'cow-photos');
  if (!photosDir.exists) photosDir.create({ intermediates: true });
  const target = new File(photosDir, `${Date.now()}.jpg`);
  new File(compressed.uri).move(target);
  log.debug('photo prepared', { uri: target.uri });
  return target.uri;
}
