import { backoffDelayMs, nextAttemptIso } from '@/sync/backoff';

describe('bounded exponential backoff', () => {
  it('doubles from the base and stays within the bound', () => {
    expect(backoffDelayMs(0)).toBe(5_000);
    expect(backoffDelayMs(1)).toBe(10_000);
    expect(backoffDelayMs(2)).toBe(20_000);
    expect(backoffDelayMs(10)).toBe(15 * 60_000);
    expect(backoffDelayMs(50)).toBe(15 * 60_000);
  });

  it('handles negative attempt counts defensively', () => {
    expect(backoffDelayMs(-3)).toBe(5_000);
  });

  it('schedules the next attempt from the given time', () => {
    const from = new Date('2026-07-02T10:00:00.000Z');
    expect(nextAttemptIso(0, from)).toBe('2026-07-02T10:00:05.000Z');
    expect(nextAttemptIso(2, from)).toBe('2026-07-02T10:00:20.000Z');
  });
});
