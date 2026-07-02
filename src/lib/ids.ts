/**
 * Client-generated UUIDs so records can be created offline
 * (IMPLEMENTATION_PROMPT rule 7). The app wires expo-crypto at database
 * startup; Node tests fall back to the global WebCrypto implementation.
 */

type IdGenerator = () => string;

let generator: IdGenerator | null = null;

export function setIdGenerator(fn: IdGenerator): void {
  generator = fn;
}

export function newId(): string {
  if (generator) return generator();
  const webCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (webCrypto?.randomUUID) return webCrypto.randomUUID();
  throw new Error('no UUID generator configured; call setIdGenerator at startup');
}
