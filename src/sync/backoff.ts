/**
 * Bounded exponential backoff for transient sync failures (ARCHITECTURE §2.7).
 */

const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 15 * 60_000;

export function backoffDelayMs(attemptCount: number): number {
  const exponent = Math.max(0, attemptCount);
  const delay = BASE_DELAY_MS * 2 ** exponent;
  return Math.min(delay, MAX_DELAY_MS);
}

export function nextAttemptIso(attemptCount: number, from: Date): string {
  return new Date(from.getTime() + backoffDelayMs(attemptCount)).toISOString();
}
