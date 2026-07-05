import type { SqlDriver } from '@/db/driver';
import {
  buildCowsCsv,
  buildHealthCsv,
  buildMilkCsv,
  buildReproCsv,
  escapeCsvField,
  formatDecimal,
  CSV_BOM,
} from '@/features/export/csv';
import { createCow } from '@/repositories/cows';
import { createHealthEvent, createReproEvent } from '@/repositories/events';
import { upsertMilkRecord } from '@/repositories/milk';

import { createMigratedTestDb, seedFarm } from '../helpers/testDb';

const FARM = 'farm-1';

describe('CSV export (es-CO Excel dialect)', () => {
  let driver: SqlDriver;
  let cowId: string;

  beforeEach(() => {
    driver = createMigratedTestDb();
    seedFarm(driver);
    cowId = createCow(
      driver,
      {
        farmId: FARM,
        name: 'Lola; "La Consentida"',
        tagNumber: 'A-01',
        birthDate: '2022-03-10',
        birthDateIsEstimated: true,
        breed: 'Holstein',
        motherId: null,
        calvingCount: 2,
        lactationStatus: 'lactating',
        pregnancyStatus: 'pregnant',
      },
      'user-1',
    ).id;
  });

  afterEach(() => driver.close());

  it('escapes separators, quotes, and newlines', () => {
    expect(escapeCsvField('simple')).toBe('simple');
    expect(escapeCsvField('con;separador')).toBe('"con;separador"');
    expect(escapeCsvField('dice "hola"')).toBe('"dice ""hola"""');
    expect(escapeCsvField('dos\nlíneas')).toBe('"dos\nlíneas"');
    expect(escapeCsvField(null)).toBe('');
  });

  it('formats decimals with comma for es-CO Excel', () => {
    expect(formatDecimal(12.5)).toBe('12,5');
    expect(formatDecimal(10)).toBe('10');
    expect(formatDecimal(7.256)).toBe('7,26');
  });

  it('builds the herd inventory with translated statuses and BOM', () => {
    const csv = buildCowsCsv(driver, FARM);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    const lines = csv.slice(CSV_BOM.length).trim().split('\r\n');
    expect(lines[0]).toContain('Nombre;Chapeta;Raza');
    expect(lines[1]).toContain('"Lola; ""La Consentida"""');
    expect(lines[1]).toContain('Holstein');
    expect(lines[1]).toContain('Sí'); // estimated birth date
    expect(lines[1]).toContain('Lactando');
    expect(lines[1]).toContain('Preñada');
  });

  it('builds the milk log with session labels and comma decimals', () => {
    upsertMilkRecord(
      driver,
      { farmId: FARM, cowId, recordDate: '2026-07-02', session: 'morning', liters: 12.5 },
      'user-1',
    );
    upsertMilkRecord(
      driver,
      { farmId: FARM, cowId, recordDate: '2026-07-02', session: 'afternoon', liters: 8 },
      'user-1',
    );
    const lines = buildMilkCsv(driver, FARM).slice(CSV_BOM.length).trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('Mañana');
    expect(lines[1]).toContain('12,5');
    expect(lines[2]).toContain('Tarde');
    expect(lines[2]).toContain('8');
  });

  it('builds health and reproduction logs', () => {
    createHealthEvent(
      driver,
      {
        farmId: FARM,
        cowId,
        eventDate: '2026-07-01',
        eventType: 'treatment',
        description: 'Antibiótico',
        withdrawalUntil: '2026-07-05',
      },
      'user-1',
    );
    createReproEvent(
      driver,
      {
        farmId: FARM,
        cowId,
        eventDate: '2026-06-01',
        eventType: 'pregnancy_check',
        result: 'pregnant',
        notes: null,
      },
      'user-1',
    );

    const health = buildHealthCsv(driver, FARM);
    expect(health).toContain('Tratamiento');
    expect(health).toContain('2026-07-05');

    const repro = buildReproCsv(driver, FARM);
    expect(repro).toContain('Chequeo de preñez');
    expect(repro).toContain('Preñada');
  });

  it('excludes soft-deleted rows', () => {
    const record = upsertMilkRecord(
      driver,
      { farmId: FARM, cowId, recordDate: '2026-07-02', session: 'morning', liters: 5 },
      'user-1',
    );
    driver.run('UPDATE milk_records SET deleted_at = ? WHERE id = ?', [
      '2026-07-02T10:00:00Z',
      record.id,
    ]);
    const lines = buildMilkCsv(driver, FARM).slice(CSV_BOM.length).trim().split('\r\n');
    expect(lines).toHaveLength(1); // header only
  });
});
