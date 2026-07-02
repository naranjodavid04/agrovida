/**
 * Injectable clock. Local timestamps are for display and diagnostics only —
 * never sync cursors (DECISIONS.md D-008). Tests override it for
 * deterministic derived-value assertions.
 */

type Clock = () => Date;

let clock: Clock = () => new Date();

export function setClock(fn: Clock): void {
  clock = fn;
}

export function resetClock(): void {
  clock = () => new Date();
}

export function now(): Date {
  return clock();
}

export function nowIso(): string {
  return now().toISOString();
}
