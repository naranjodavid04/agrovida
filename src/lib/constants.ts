/**
 * Shared domain constants (PRODUCT_SPEC §6: one shared upper bound for liters).
 */

/**
 * Upper validation bound for a single milking session, in liters. Exceptional
 * cows peak near ~55 L/day across two sessions; anything above this per
 * session is treated as a data-entry error.
 */
export const MAX_LITERS_PER_SESSION = 60;

/** Sessions recorded per cow per day. */
export const MILK_SESSIONS = ['morning', 'afternoon'] as const;

/** Days shown in the production sparkline. */
export const TREND_DAYS = 7;

/** Bovine gestation length used to derive the expected calving date (D-019). */
export const GESTATION_DAYS = 283;

/** Reminder windows (D-019). All reminders are derived, never stored. */
export const DRY_OFF_DAYS_BEFORE_CALVING = 60;
export const CALVING_ALERT_DAYS = 21;
export const DRY_OFF_ALERT_DAYS = 14;
export const PREGNANCY_CHECK_DUE_DAYS = 30;
