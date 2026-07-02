import type { SqlDriver } from '@/db/driver';
import { createLogger } from '@/lib/logger';
import { listOpenConflicts } from '@/repositories/conflicts';

import { runSyncCycle, type SyncCycleResult } from './engine';
import { countPendingMutations } from './outbox';
import { runPhotoUploads, type PhotoUploader } from './photos';
import type { SyncRemote } from './remote';
import { getSyncInfo } from './syncState';

/**
 * Automatic sync coordinator (PRODUCT_SPEC §3): callers request a sync on
 * reconnect, app foreground, auth refresh, or manual retry; the coordinator
 * serializes cycles (single flight) and re-runs when a request arrives while
 * one is in progress. The worker never presses an "upload" button.
 */

const log = createLogger('sync:coordinator');

export type SyncUiStatus = 'idle' | 'offline' | 'syncing' | 'synced' | 'error' | 'action_required';

export interface SyncSnapshot {
  status: SyncUiStatus;
  pendingCount: number;
  openConflicts: number;
  lastSuccessAt: string | null;
  lastError: string | null;
}

export interface CoordinatorDeps {
  getDriver: () => SqlDriver;
  getRemote: () => SyncRemote;
  getFarmId: () => string | null;
  /** Sync waits until the session refresh succeeds (ARCHITECTURE §7). */
  hasValidSession: () => Promise<boolean>;
  isOnline: () => boolean;
  photoUploader?: PhotoUploader;
  onSnapshot?: (snapshot: SyncSnapshot) => void;
}

export interface SyncCoordinator {
  requestSync: (reason: string) => Promise<void>;
  getSnapshot: () => SyncSnapshot;
}

export function computeSnapshot(
  driver: SqlDriver,
  farmId: string,
  phase: 'idle' | 'syncing' | 'offline',
): SyncSnapshot {
  const pendingCount = countPendingMutations(driver, farmId);
  const openConflicts = listOpenConflicts(driver, farmId).length;
  const info = getSyncInfo(driver, farmId);
  let status: SyncUiStatus;
  if (phase === 'syncing') status = 'syncing';
  else if (phase === 'offline') status = 'offline';
  else if (openConflicts > 0) status = 'action_required';
  else if (info.lastError) status = 'error';
  else if (pendingCount > 0) status = 'idle';
  else status = 'synced';
  return {
    status,
    pendingCount,
    openConflicts,
    lastSuccessAt: info.lastSuccessAt,
    lastError: info.lastError,
  };
}

export function createSyncCoordinator(deps: CoordinatorDeps): SyncCoordinator {
  let running = false;
  let rerunRequested = false;
  let lastSnapshot: SyncSnapshot = {
    status: 'idle',
    pendingCount: 0,
    openConflicts: 0,
    lastSuccessAt: null,
    lastError: null,
  };

  function publish(phase: 'idle' | 'syncing' | 'offline'): void {
    const farmId = deps.getFarmId();
    if (!farmId) return;
    lastSnapshot = computeSnapshot(deps.getDriver(), farmId, phase);
    deps.onSnapshot?.(lastSnapshot);
  }

  async function runOnce(reason: string): Promise<SyncCycleResult | null> {
    const farmId = deps.getFarmId();
    if (!farmId) return null;
    if (!deps.isOnline()) {
      log.info('sync skipped: offline', { reason });
      publish('offline');
      return null;
    }
    if (!(await deps.hasValidSession())) {
      log.info('sync skipped: no valid session', { reason });
      publish('idle');
      return null;
    }
    publish('syncing');
    const driver = deps.getDriver();
    const result = await runSyncCycle(driver, deps.getRemote(), farmId);
    if (deps.photoUploader) {
      await runPhotoUploads(driver, deps.photoUploader, farmId);
    }
    publish('idle');
    return result;
  }

  return {
    async requestSync(reason: string): Promise<void> {
      if (running) {
        rerunRequested = true;
        return;
      }
      running = true;
      try {
        do {
          rerunRequested = false;
          try {
            await runOnce(reason);
          } catch (error) {
            log.error('sync cycle crashed', {
              message: error instanceof Error ? error.message : String(error),
            });
            publish('idle');
          }
        } while (rerunRequested);
      } finally {
        running = false;
      }
    },
    getSnapshot(): SyncSnapshot {
      return lastSnapshot;
    },
  };
}
