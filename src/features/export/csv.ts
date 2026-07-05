import type { SqlDriver } from '@/db/driver';
import { strings } from '@/lib/i18n/strings';

/**
 * CSV builders (D-019). Excel with es-CO regional settings expects the
 * semicolon list separator and comma decimals; the UTF-8 BOM makes accents
 * open correctly. Pure functions over the local database so they work fully
 * offline and are testable in Node.
 */

export const CSV_BOM = '﻿';
const SEP = ';';

export function escapeCsvField(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[";\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** es-CO decimals: 12.5 → "12,5". */
export function formatDecimal(value: number): string {
  return (Math.round(value * 100) / 100).toString().replace('.', ',');
}

function buildCsv(header: string[], rows: (string | number | null)[][]): string {
  const lines = [header, ...rows].map((row) => row.map(escapeCsvField).join(SEP));
  return CSV_BOM + lines.join('\r\n') + '\r\n';
}

const LIFECYCLE_ES: Record<string, string> = {
  active: strings.status.active,
  sold: strings.status.sold,
  deceased: strings.status.deceased,
  culled: strings.status.culled,
};
const LACTATION_ES: Record<string, string> = {
  lactating: strings.status.lactating,
  dry: strings.status.dry,
  unknown: '—',
};
const PREGNANCY_ES: Record<string, string> = {
  pregnant: strings.status.pregnant,
  open: strings.status.open,
  unknown: '—',
};

export function buildCowsCsv(driver: SqlDriver, farmId: string): string {
  const rows = driver.all<{
    name: string;
    tag_number: string | null;
    breed: string | null;
    birth_date: string | null;
    birth_date_is_estimated: number;
    calving_count: number;
    lifecycle_status: string;
    lactation_status: string;
    pregnancy_status: string;
    mother_name: string | null;
  }>(
    `SELECT c.name, c.tag_number, c.breed, c.birth_date, c.birth_date_is_estimated,
            c.calving_count, c.lifecycle_status, c.lactation_status, c.pregnancy_status,
            m.name AS mother_name
     FROM cows c LEFT JOIN cows m ON m.id = c.mother_id
     WHERE c.farm_id = ? AND c.deleted_at IS NULL
     ORDER BY c.name COLLATE NOCASE`,
    [farmId],
  );
  return buildCsv(
    [
      strings.herd.name,
      strings.herd.tag,
      strings.herd.breed,
      strings.herd.birthDate,
      strings.herd.birthDateEstimated,
      strings.herd.calvingCount,
      'Estado',
      'Lactancia',
      'Preñez',
      strings.herd.mother,
    ],
    rows.map((row) => [
      row.name,
      row.tag_number,
      row.breed,
      row.birth_date,
      row.birth_date_is_estimated === 1 ? 'Sí' : 'No',
      row.calving_count,
      LIFECYCLE_ES[row.lifecycle_status] ?? row.lifecycle_status,
      LACTATION_ES[row.lactation_status] ?? row.lactation_status,
      PREGNANCY_ES[row.pregnancy_status] ?? row.pregnancy_status,
      row.mother_name,
    ]),
  );
}

export function buildMilkCsv(driver: SqlDriver, farmId: string): string {
  const rows = driver.all<{
    record_date: string;
    session: string;
    liters: number;
    cow_name: string;
    tag_number: string | null;
  }>(
    `SELECT r.record_date, r.session, r.liters, c.name AS cow_name, c.tag_number
     FROM milk_records r JOIN cows c ON c.id = r.cow_id
     WHERE r.farm_id = ? AND r.deleted_at IS NULL
     ORDER BY r.record_date DESC, c.name COLLATE NOCASE, r.session DESC`,
    [farmId],
  );
  return buildCsv(
    [strings.milk.date, strings.milk.session, strings.herd.name, strings.herd.tag, 'Litros'],
    rows.map((row) => [
      row.record_date,
      row.session === 'morning' ? strings.milk.morning : strings.milk.afternoon,
      row.cow_name,
      row.tag_number,
      formatDecimal(row.liters),
    ]),
  );
}

export function buildHealthCsv(driver: SqlDriver, farmId: string): string {
  const rows = driver.all<{
    event_date: string;
    event_type: string;
    description: string;
    withdrawal_until: string | null;
    cow_name: string;
    tag_number: string | null;
  }>(
    `SELECT h.event_date, h.event_type, h.description, h.withdrawal_until,
            c.name AS cow_name, c.tag_number
     FROM health_events h JOIN cows c ON c.id = h.cow_id
     WHERE h.farm_id = ? AND h.deleted_at IS NULL
     ORDER BY h.event_date DESC`,
    [farmId],
  );
  const typeLabels: Record<string, string> = {
    treatment: strings.health.treatment,
    vaccination: strings.health.vaccination,
    illness: strings.health.illness,
    checkup: strings.health.checkup,
    other: strings.health.other,
  };
  return buildCsv(
    [
      strings.milk.date,
      strings.herd.name,
      strings.herd.tag,
      strings.health.eventType,
      strings.health.description,
      'Retiro de leche hasta',
    ],
    rows.map((row) => [
      row.event_date,
      row.cow_name,
      row.tag_number,
      typeLabels[row.event_type] ?? row.event_type,
      row.description,
      row.withdrawal_until,
    ]),
  );
}

export function buildReproCsv(driver: SqlDriver, farmId: string): string {
  const rows = driver.all<{
    event_date: string;
    event_type: string;
    result: string | null;
    notes: string | null;
    cow_name: string;
    tag_number: string | null;
  }>(
    `SELECT e.event_date, e.event_type, e.result, e.notes,
            c.name AS cow_name, c.tag_number
     FROM repro_events e JOIN cows c ON c.id = e.cow_id
     WHERE e.farm_id = ? AND e.deleted_at IS NULL
     ORDER BY e.event_date DESC`,
    [farmId],
  );
  const typeLabels: Record<string, string> = {
    heat: strings.repro.heat,
    insemination: strings.repro.insemination,
    pregnancy_check: strings.repro.pregnancyCheck,
    calving: strings.repro.calving,
    abortion: strings.repro.abortion,
  };
  return buildCsv(
    [
      strings.milk.date,
      strings.herd.name,
      strings.herd.tag,
      strings.health.eventType,
      strings.repro.result,
      'Notas',
    ],
    rows.map((row) => [
      row.event_date,
      row.cow_name,
      row.tag_number,
      typeLabels[row.event_type] ?? row.event_type,
      row.result === 'pregnant'
        ? strings.status.pregnant
        : row.result === 'open'
          ? strings.status.open
          : null,
      row.notes,
    ]),
  );
}

export type ExportKind = 'cows' | 'milk' | 'health' | 'repro';

export const EXPORT_BUILDERS: Record<ExportKind, (driver: SqlDriver, farmId: string) => string> = {
  cows: buildCowsCsv,
  milk: buildMilkCsv,
  health: buildHealthCsv,
  repro: buildReproCsv,
};
