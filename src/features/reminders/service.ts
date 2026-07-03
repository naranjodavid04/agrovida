import type { SqlDriver } from '@/db/driver';
import {
  CALVING_ALERT_DAYS,
  DRY_OFF_ALERT_DAYS,
  DRY_OFF_DAYS_BEFORE_CALVING,
  PREGNANCY_CHECK_DUE_DAYS,
} from '@/lib/constants';
import { addDaysIso } from '@/lib/dates';
import { listCows } from '@/repositories/cows';
import { activeWithdrawalUntil, expectedCalvingDate } from '@/repositories/events';

/**
 * Derived reminders (D-019): computed on read from cows and events, never
 * stored, so they are always consistent with synced data and work fully
 * offline. OS notifications can layer on top later (dev build phase).
 */

export type ReminderKind =
  'calving_upcoming' | 'drying_off' | 'pregnancy_check_due' | 'withdrawal_active';

export interface Reminder {
  kind: ReminderKind;
  cowId: string;
  cowName: string;
  /** Date the reminder refers to (calving date, withdrawal end, etc.). */
  dueDate: string;
}

const KIND_ORDER: Record<ReminderKind, number> = {
  withdrawal_active: 0,
  drying_off: 1,
  calving_upcoming: 2,
  pregnancy_check_due: 3,
};

export function computeReminders(driver: SqlDriver, farmId: string, todayIso: string): Reminder[] {
  const reminders: Reminder[] = [];

  for (const cow of listCows(driver, farmId)) {
    if (cow.lifecycleStatus !== 'active') continue;

    // Milk in withdrawal: always surfaced while active.
    const withdrawal = activeWithdrawalUntil(driver, cow.id, todayIso);
    if (withdrawal) {
      reminders.push({
        kind: 'withdrawal_active',
        cowId: cow.id,
        cowName: cow.name,
        dueDate: withdrawal,
      });
    }

    const calving = expectedCalvingDate(driver, cow.id);
    if (calving) {
      // Drying off: recommended DRY_OFF_DAYS_BEFORE_CALVING before calving,
      // alerted from DRY_OFF_ALERT_DAYS ahead while the cow still lactates.
      const dryOffDate = addDaysIso(calving, -DRY_OFF_DAYS_BEFORE_CALVING);
      if (
        cow.lactationStatus === 'lactating' &&
        dryOffDate <= addDaysIso(todayIso, DRY_OFF_ALERT_DAYS)
      ) {
        reminders.push({
          kind: 'drying_off',
          cowId: cow.id,
          cowName: cow.name,
          dueDate: dryOffDate,
        });
      }

      // Upcoming (or slightly overdue) calving.
      if (calving <= addDaysIso(todayIso, CALVING_ALERT_DAYS)) {
        reminders.push({
          kind: 'calving_upcoming',
          cowId: cow.id,
          cowName: cow.name,
          dueDate: calving,
        });
      }
    }

    // Insemination without a pregnancy check after the due window.
    const insemination = driver.get<{ event_date: string }>(
      `SELECT event_date FROM repro_events
       WHERE cow_id = ? AND deleted_at IS NULL AND event_type = 'insemination'
       ORDER BY event_date DESC LIMIT 1`,
      [cow.id],
    );
    if (insemination) {
      const followUp = driver.get<{ id: string }>(
        `SELECT id FROM repro_events
         WHERE cow_id = ? AND deleted_at IS NULL AND event_date >= ?
           AND event_type IN ('pregnancy_check', 'calving', 'abortion')
         LIMIT 1`,
        [cow.id, insemination.event_date],
      );
      const dueDate = addDaysIso(insemination.event_date, PREGNANCY_CHECK_DUE_DAYS);
      if (!followUp && dueDate <= todayIso) {
        reminders.push({
          kind: 'pregnancy_check_due',
          cowId: cow.id,
          cowName: cow.name,
          dueDate,
        });
      }
    }
  }

  return reminders.sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  );
}
