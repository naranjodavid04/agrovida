import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { hasRemoteConfig } from '@/lib/env';
import { strings } from '@/lib/i18n/strings';
import { createLogger } from '@/lib/logger';
import { getSupabase } from '@/lib/supabase';
import { colors, fonts } from '@/lib/theme/tokens';
import type { Cow } from '@/types/domain';

const log = createLogger('ui:cow-photo');
const BUCKET = 'cow-photos';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Cow photo with offline-first resolution (D-010): a pending local file wins;
 * otherwise photos from other devices are downloaded once into an app cache
 * so they keep displaying offline; a placeholder covers the rest.
 */

function cachedFileFor(photoPath: string): File {
  const dir = new Directory(Paths.cache, 'cow-photos-cache');
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, photoPath.replace(/[/\\:]/g, '_'));
}

interface Props {
  cow: Pick<Cow, 'name' | 'photoLocalUri' | 'photoPath'>;
  style?: StyleProp<ImageStyle>;
}

export function CowPhoto({ cow, style }: Props) {
  // Keyed by path so a stale URL from a previous cow is never shown.
  const [resolved, setResolved] = useState<{ path: string; url: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const path = cow.photoPath;
    if (cow.photoLocalUri || !path) return;
    (async () => {
      try {
        const cached = cachedFileFor(path);
        if (cached.exists) {
          if (!cancelled) setResolved({ path, url: cached.uri });
          return;
        }
        if (!hasRemoteConfig()) return;
        const { data, error } = await getSupabase()
          .storage.from(BUCKET)
          .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
        if (error || !data) {
          if (error) log.debug('signed url unavailable (offline?)', { message: error.message });
          return;
        }
        try {
          const downloaded = await File.downloadFileAsync(data.signedUrl, cached);
          if (!cancelled) setResolved({ path, url: downloaded.uri });
          log.debug('remote photo cached', { path });
        } catch {
          // Cache write failed: stream the signed URL for this session.
          if (!cancelled) setResolved({ path, url: data.signedUrl });
        }
      } catch (error) {
        log.debug('photo resolution failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cow.photoLocalUri, cow.photoPath]);

  const uri =
    cow.photoLocalUri ?? (resolved && resolved.path === cow.photoPath ? resolved.url : null);

  if (!uri) {
    return (
      <View
        style={[styles.placeholder, style as StyleProp<ViewStyle>]}
        accessibilityLabel={strings.a11y.cowPhoto}
      >
        <Text style={styles.placeholderText}>🐄</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={[styles.image, style]}
      contentFit="cover"
      accessibilityLabel={`${strings.a11y.cowPhoto}: ${cow.name}`}
      transition={150}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.surfaceSoft,
  },
  placeholder: {
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontFamily: fonts.regular,
    fontSize: 34,
  },
});
