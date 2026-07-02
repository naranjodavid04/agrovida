import { now } from './clock';

/**
 * Date helpers for farm-local calendar dates (YYYY-MM-DD). Milk records key
 * on the device's local calendar day, matching how milking sessions work.
 */

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayIsoDate(): string {
  return toIsoDate(now());
}

export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || d === undefined) throw new Error(`invalid ISO date: ${isoDate}`);
  const date = new Date(y, m - 1, d + days);
  return toIsoDate(date);
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return false;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export interface Age {
  years: number;
  months: number;
}

/**
 * Age derived from birth_date (DECISIONS.md D-006). Returns null for missing
 * or future birth dates.
 */
export function ageFromBirthDate(birthDate: string | null, reference?: Date): Age | null {
  if (!birthDate || !isValidIsoDate(birthDate)) return null;
  const ref = reference ?? now();
  const [y, m, d] = birthDate.split('-').map(Number) as [number, number, number];
  const birth = new Date(y, m - 1, d);
  if (birth.getTime() > ref.getTime()) return null;
  let years = ref.getFullYear() - birth.getFullYear();
  let months = ref.getMonth() - birth.getMonth();
  if (ref.getDate() < birth.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months };
}
