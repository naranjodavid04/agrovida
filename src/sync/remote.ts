import type { SupabaseClient } from '@supabase/supabase-js';

import type { MilkSession } from '@/types/domain';

/**
 * Server abstraction for the sync engine. Tests inject an in-memory fake;
 * the app binds it to Supabase. Push results are classified so the engine
 * can distinguish retryable failures from permanent conflicts.
 */

export type PushResult =
  | { kind: 'ok' }
  | { kind: 'unique_violation' }
  | { kind: 'permission_denied'; message: string }
  | { kind: 'transient'; message: string };

export interface PullRow {
  entity_type: 'farm' | 'farm_member' | 'farm_invite' | 'cow' | 'milk_record';
  entity_id: string;
  server_version: number;
  deleted_at: string | null;
  row_data: Record<string, unknown>;
}

export interface SyncRemote {
  upsertEntity(
    entityType: 'cow' | 'milk_record',
    payload: Record<string, unknown>,
  ): Promise<PushResult>;
  /** Canonical active record for a milk session (conflict resolution, D-016). */
  fetchMilkRecord(
    farmId: string,
    cowId: string,
    recordDate: string,
    session: MilkSession,
  ): Promise<Record<string, unknown> | null>;
  pullChanges(farmId: string, afterVersion: number, limit: number): Promise<PullRow[]>;
}

const TABLE_BY_ENTITY = {
  cow: 'cows',
  milk_record: 'milk_records',
} as const;

interface PostgrestishError {
  code?: string;
  message?: string;
  status?: number;
}

function classifyError(error: PostgrestishError): PushResult {
  const code = error.code ?? '';
  const message = error.message ?? 'unknown error';
  if (code === '23505') return { kind: 'unique_violation' };
  if (code === '42501' || error.status === 403 || code === 'PGRST301') {
    return { kind: 'permission_denied', message };
  }
  // Check constraints, invalid input, and triggers are permanent too.
  if (code.startsWith('23') || code.startsWith('22') || code === 'P0001') {
    return { kind: 'permission_denied', message };
  }
  return { kind: 'transient', message };
}

export function createSupabaseRemote(client: SupabaseClient): SyncRemote {
  return {
    async upsertEntity(entityType, payload) {
      try {
        const { error } = await client
          .from(TABLE_BY_ENTITY[entityType])
          .upsert(payload, { onConflict: 'id' });
        if (!error) return { kind: 'ok' };
        return classifyError(error);
      } catch (error) {
        return {
          kind: 'transient',
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },

    async fetchMilkRecord(farmId, cowId, recordDate, session) {
      const { data, error } = await client
        .from('milk_records')
        .select('*')
        .eq('farm_id', farmId)
        .eq('cow_id', cowId)
        .eq('record_date', recordDate)
        .eq('session', session)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      return (data as Record<string, unknown> | null) ?? null;
    },

    async pullChanges(farmId, afterVersion, limit) {
      const { data, error } = await client.rpc('pull_changes', {
        p_farm_id: farmId,
        p_after_version: afterVersion,
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as PullRow[];
    },
  };
}
