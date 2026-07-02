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
 * otherwise a signed URL for the private bucket is requested (needs network);
 * otherwise a placeholder. Pending uploads keep displaying locally.
 */

interface Props {
  cow: Pick<Cow, 'name' | 'photoLocalUri' | 'photoPath'>;
  style?: StyleProp<ImageStyle>;
}

export function CowPhoto({ cow, style }: Props) {
  // Keyed by path so a stale URL from a previous cow is never shown.
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const path = cow.photoPath;
    if (cow.photoLocalUri || !path || !hasRemoteConfig()) return;
    getSupabase()
      .storage.from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
      .then(({ data, error }) => {
        if (!cancelled && !error && data) setSigned({ path, url: data.signedUrl });
        if (error) log.debug('signed url unavailable (offline?)', { message: error.message });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [cow.photoLocalUri, cow.photoPath]);

  const uri = cow.photoLocalUri ?? (signed && signed.path === cow.photoPath ? signed.url : null);

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
