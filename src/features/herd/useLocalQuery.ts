import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getDatabase } from '@/db/database';
import type { SqlDriver } from '@/db/driver';
import { useSync } from '@/features/sync/SyncProvider';

/**
 * Reads a SQLite-derived view model, re-running on focus and after each sync
 * snapshot change so pulled rows appear without manual refresh. Domain
 * screens read exclusively through this (no SQL in the UI).
 */
export function useLocalQuery<T>(query: (driver: SqlDriver) => T): {
  data: T | null;
  reload: () => void;
} {
  const { snapshot } = useSync();
  const [data, setData] = useState<T | null>(null);

  const reload = useCallback(() => {
    setData(query(getDatabase()));
  }, [query]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  // Re-derive after sync activity (lastSuccessAt/pendingCount change).
  useFocusEffect(
    useCallback(() => {
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [snapshot.lastSuccessAt, snapshot.pendingCount, reload]),
  );

  return { data, reload };
}
