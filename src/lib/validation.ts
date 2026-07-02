import { MAX_LITERS_PER_SESSION } from './constants';
import { isValidIsoDate, todayIsoDate } from './dates';

/**
 * Domain validation shared by repositories and forms. Errors carry stable
 * codes; screens map codes to the centralized es-CO strings.
 */

export type DomainErrorCode =
  | 'invalid_liters'
  | 'liters_too_high'
  | 'invalid_date'
  | 'future_birth_date'
  | 'name_required'
  | 'own_mother'
  | 'mother_not_found'
  | 'mother_other_farm'
  | 'duplicate_tag'
  | 'duplicate_session'
  | 'cow_not_found'
  | 'invalid_session'
  | 'invalid_calving_count';

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    detail?: string,
  ) {
    super(detail ?? code);
    this.name = 'DomainError';
  }
}

export function validateLiters(liters: number): void {
  if (typeof liters !== 'number' || !Number.isFinite(liters) || liters < 0) {
    throw new DomainError('invalid_liters');
  }
  if (liters > MAX_LITERS_PER_SESSION) {
    throw new DomainError('liters_too_high');
  }
}

export function validateRecordDate(isoDate: string): void {
  if (!isValidIsoDate(isoDate)) throw new DomainError('invalid_date');
}

export function validateCowName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 120) throw new DomainError('name_required');
  return trimmed;
}

export function validateBirthDate(birthDate: string | null): void {
  if (birthDate === null) return;
  if (!isValidIsoDate(birthDate)) throw new DomainError('invalid_date');
  if (birthDate > todayIsoDate()) throw new DomainError('future_birth_date');
}

export function validateCalvingCount(count: number): void {
  if (!Number.isInteger(count) || count < 0 || count > 30) {
    throw new DomainError('invalid_calving_count');
  }
}

export function normalizeTag(tag: string | null): string | null {
  if (tag === null) return null;
  const trimmed = tag.trim();
  return trimmed.length === 0 ? null : trimmed;
}
