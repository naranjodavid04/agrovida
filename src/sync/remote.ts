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
  entity_type:
    | 'farm'
    | 'farm_member'
    | 'farm_invite'
    | 'cow'
    | 'milk_record'
    | 'health_event'
    | 'repro_event'
    | 'milk_sale';
  entity_id: string;
  server_version: number;
  deleted_at: string | null;
  row_data: Record<string, unknown>;
}

export type PushEntityType = 'cow' | 'milk_record' | 'health_event' | 'repro_event' | 'milk_sale';

export interface SyncRemote {
  upsertEntity(entityType: PushEntityType, payload: Record<string, unknown>): Promise<PushResult>;
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
  health_event: 'health_events',
  repro_event: 'repro_events',
  milk_sale: 'milk_sales',
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
      const table = TABLE_BY_ENTITY[entityType];
      try {
        // Update-first instead of a Postgres upsert: an upsert must satisfy
        // the INSERT policy (created_by/recorded_by = auth.uid()) even when
        // the row already exists, which blocked cross-member edits. A plain
        // UPDATE only needs the UPDATE policy; the INSERT fallback keeps
        // attribution enforcement for genuinely new rows.
        const updated = await client
          .from(table)
          .update(payload, { count: 'exact' })
          .eq('id', String(payload.id));
        if (updated.error) return classifyError(updated.error);
        if ((updated.count ?? 0) > 0) return { kind: 'ok' };

        const inserted = await client.from(table).insert(payload);
        if (!inserted.error) return { kind: 'ok' };
        // Same-id race (duplicate delivery): the row appeared between the
        // update and the insert — retry the update once.
        if (inserted.error.code === '23505') {
          const retried = await client
            .from(table)
            .update(payload, { count: 'exact' })
            .eq('id', String(payload.id));
          if (!retried.error && (retried.count ?? 0) > 0) return { kind: 'ok' };
        }
        return classifyError(inserted.error);
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
