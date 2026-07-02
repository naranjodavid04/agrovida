import { MAX_LITERS_PER_SESSION } from '@/lib/constants';
import {
  DomainError,
  normalizeTag,
  validateBirthDate,
  validateCalvingCount,
  validateCowName,
  validateLiters,
} from '@/lib/validation';

describe('validation', () => {
  describe('liters (PRODUCT_SPEC §6: finite, non-negative, shared bound)', () => {
    it('accepts valid amounts including zero', () => {
      expect(() => validateLiters(0)).not.toThrow();
      expect(() => validateLiters(12.5)).not.toThrow();
      expect(() => validateLiters(MAX_LITERS_PER_SESSION)).not.toThrow();
    });

    it('rejects negatives, NaN, and infinities', () => {
      for (const value of [-1, NaN, Infinity, -Infinity]) {
        expect(() => validateLiters(value)).toThrow(DomainError);
      }
    });

    it('rejects amounts above the shared bound', () => {
      expect(() => validateLiters(MAX_LITERS_PER_SESSION + 0.01)).toThrow(
        expect.objectContaining({ code: 'liters_too_high' }),
      );
    });
  });

  it('requires a non-empty cow name and trims it', () => {
    expect(validateCowName('  Lola ')).toBe('Lola');
    expect(() => validateCowName('   ')).toThrow(DomainError);
  });

  it('rejects future birth dates', () => {
    expect(() => validateBirthDate('2999-01-01')).toThrow(
      expect.objectContaining({ code: 'future_birth_date' }),
    );
    expect(() => validateBirthDate(null)).not.toThrow();
  });

  it('bounds calving count to sane integers', () => {
    expect(() => validateCalvingCount(3)).not.toThrow();
    expect(() => validateCalvingCount(-1)).toThrow(DomainError);
    expect(() => validateCalvingCount(2.5)).toThrow(DomainError);
    expect(() => validateCalvingCount(31)).toThrow(DomainError);
  });

  it('normalizes empty tags to null', () => {
    expect(normalizeTag('  ')).toBeNull();
    expect(normalizeTag(null)).toBeNull();
    expect(normalizeTag(' A-01 ')).toBe('A-01');
  });
});
