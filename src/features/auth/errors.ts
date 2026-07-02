import { strings } from '@/lib/i18n/strings';

/**
 * Maps auth/network failures to es-CO copy. Errors must say whether data is
 * safe locally and what to do next (PRODUCT_SPEC §7).
 */
export function authErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error);
  if (message.includes('invalid login credentials')) return strings.auth.invalidCredentials;
  if (message.includes('user already registered')) return strings.auth.emailInUse;
  if (message.includes('password should be at least')) return strings.auth.passwordTooShort;
  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('failed to fetch') ||
    message.includes('timeout')
  ) {
    return strings.auth.firstLoginNeedsInternet;
  }
  return `${strings.sync.errorWillRetry}`;
}
