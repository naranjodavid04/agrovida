import { addDaysIso, ageFromBirthDate, isValidIsoDate, toIsoDate } from '@/lib/dates';

describe('dates', () => {
  it('formats local dates as YYYY-MM-DD', () => {
    expect(toIsoDate(new Date(2026, 6, 1))).toBe('2026-07-01');
  });

  it('adds and subtracts days across month boundaries', () => {
    expect(addDaysIso('2026-07-01', -1)).toBe('2026-06-30');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('validates ISO dates strictly', () => {
    expect(isValidIsoDate('2026-07-01')).toBe(true);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-7-1')).toBe(false);
    expect(isValidIsoDate('no')).toBe(false);
  });

  describe('ageFromBirthDate (D-006: age is always derived)', () => {
    const ref = new Date(2026, 6, 1); // 2026-07-01

    it('computes whole years and months', () => {
      expect(ageFromBirthDate('2022-07-01', ref)).toEqual({ years: 4, months: 0 });
      expect(ageFromBirthDate('2024-01-15', ref)).toEqual({ years: 2, months: 5 });
    });

    it('handles month not yet completed', () => {
      expect(ageFromBirthDate('2024-06-15', ref)).toEqual({ years: 2, months: 0 });
      expect(ageFromBirthDate('2026-06-15', ref)).toEqual({ years: 0, months: 0 });
    });

    it('returns null for missing, invalid, or future dates', () => {
      expect(ageFromBirthDate(null, ref)).toBeNull();
      expect(ageFromBirthDate('bad-date', ref)).toBeNull();
      expect(ageFromBirthDate('2027-01-01', ref)).toBeNull();
    });
  });
});
