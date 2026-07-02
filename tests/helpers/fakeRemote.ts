import type { PullRow, PushResult, SyncRemote } from '@/sync/remote';
import type { MilkSession } from '@/types/domain';

/**
 * In-memory server mimicking the Supabase backend semantics the engine
 * relies on: global monotonic server_version, idempotent upserts by id, and
 * the partial-unique milk session index (23505 → unique_violation).
 */

type Row = Record<string, unknown>;

export class FakeRemoteServer implements SyncRemote {
  private version = 0;
  readonly tables: { cow: Map<string, Row>; milk_record: Map<string, Row> } = {
    cow: new Map(),
    milk_record: new Map(),
  };
  /** Upsert log to assert idempotency/duplicate delivery. */
  readonly upsertLog: string[] = [];
  /** When set, the next N upserts fail with a transient error. */
  failNextUpserts = 0;
  /** When set, pulls throw (network down mid-cycle). */
  failPulls = false;

  private nextVersion(): number {
    this.version += 1;
    return this.version;
  }

  /** Seeds a server-side row directly (as if another device pushed it). */
  seed(entityType: 'cow' | 'milk_record', row: Row): Row {
    const stored = { ...row, server_version: this.nextVersion() };
    this.tables[entityType].set(String(row.id), stored);
    return stored;
  }

  async upsertEntity(entityType: 'cow' | 'milk_record', payload: Row): Promise<PushResult> {
    this.upsertLog.push(`${entityType}:${String(payload.id)}`);
    if (this.failNextUpserts > 0) {
      this.failNextUpserts -= 1;
      return { kind: 'transient', message: 'simulated network failure' };
    }
    if (entityType === 'milk_record' && payload.deleted_at === null) {
      for (const existing of this.tables.milk_record.values()) {
        if (
          existing.deleted_at === null &&
          String(existing.id) !== String(payload.id) &&
          existing.farm_id === payload.farm_id &&
          existing.cow_id === payload.cow_id &&
          existing.record_date === payload.record_date &&
          existing.session === payload.session
        ) {
          return { kind: 'unique_violation' };
        }
      }
    }
    this.tables[entityType].set(String(payload.id), {
      ...payload,
      server_version: this.nextVersion(),
    });
    return { kind: 'ok' };
  }

  async fetchMilkRecord(
    farmId: string,
    cowId: string,
    recordDate: string,
    session: MilkSession,
  ): Promise<Row | null> {
    for (const row of this.tables.milk_record.values()) {
      if (
        row.deleted_at === null &&
        row.farm_id === farmId &&
        row.cow_id === cowId &&
        row.record_date === recordDate &&
        row.session === session
      ) {
        return row;
      }
    }
    return null;
  }

  async pullChanges(farmId: string, afterVersion: number, limit: number): Promise<PullRow[]> {
    if (this.failPulls) throw new Error('simulated pull failure');
    const rows: PullRow[] = [];
    const collect = (entityType: 'cow' | 'milk_record', map: Map<string, Row>) => {
      for (const row of map.values()) {
        if (row.farm_id === farmId && Number(row.server_version) > afterVersion) {
          rows.push({
            entity_type: entityType,
            entity_id: String(row.id),
            server_version: Number(row.server_version),
            deleted_at: (row.deleted_at as string | null) ?? null,
            row_data: row,
          });
        }
      }
    };
    collect('cow', this.tables.cow);
    collect('milk_record', this.tables.milk_record);
    rows.sort((a, b) => a.server_version - b.server_version);
    return rows.slice(0, limit);
  }
}
