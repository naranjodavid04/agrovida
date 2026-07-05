import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { SqlDriver } from '@/db/driver';
import { todayIsoDate } from '@/lib/dates';
import { createLogger } from '@/lib/logger';

import { EXPORT_BUILDERS, type ExportKind } from './csv';

const log = createLogger('export');

const KIND_SLUG: Record<ExportKind, string> = {
  cows: 'rebano',
  milk: 'leche',
  health: 'salud',
  repro: 'reproduccion',
};

/**
 * Builds the CSV from the local database, writes it to the app cache, and
 * opens the system share sheet (WhatsApp, Drive, email…). Fully offline —
 * sharing is up to whatever app the user picks.
 */
export async function exportAndShareCsv(
  driver: SqlDriver,
  farmId: string,
  farmName: string,
  kind: ExportKind,
): Promise<void> {
  const csv = EXPORT_BUILDERS[kind](driver, farmId);
  const dir = new Directory(Paths.cache, 'exports');
  if (!dir.exists) dir.create({ intermediates: true });
  const safeFarm = farmName.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase();
  const file = new File(dir, `agrovida-${safeFarm}-${KIND_SLUG[kind]}-${todayIsoDate()}.csv`);
  if (file.exists) file.delete();
  file.write(csv);
  log.info('csv exported', { kind, uri: file.uri });
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: file.name,
  });
}
