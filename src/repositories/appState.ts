import type { SqlDriver } from '@/db/driver';

/**
 * Small key/value store for bootstrap state that must survive offline
 * restarts: active farm, cached user identity (ARCHITECTURE §7).
 */

export const APP_STATE_KEYS = {
  activeFarmId: 'active_farm_id',
  cachedUser: 'cached_user',
} as const;

export function getAppState(driver: SqlDriver, key: string): string | null {
  const row = driver.get<{ value: string }>('SELECT value FROM app_state WHERE key = ?', [key]);
  return row?.value ?? null;
}

export function setAppState(driver: SqlDriver, key: string, value: string): void {
  driver.run('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)', [key, value]);
}

export function deleteAppState(driver: SqlDriver, key: string): void {
  driver.run('DELETE FROM app_state WHERE key = ?', [key]);
}
