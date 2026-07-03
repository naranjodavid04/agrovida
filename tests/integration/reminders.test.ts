import type { SqlDriver } from '@/db/driver';
import { computeReminders } from '@/features/reminders/service';
import { createCow, setLifecycleStatus, updateCow } from '@/repositories/cows';
import { createHealthEvent, createReproEvent } from '@/repositories/events';

import { createMigratedTestDb, seedFarm } from '../helpers/testDb';

const FARM = 'farm-1';
const TODAY = '2026-07-02';

describe('derived reminders (D-019)', () => {
  let driver: SqlDriver;
  let cowId: string;

  function makeCow(name: string, tag: string) {
    return createCow(
      driver,
      {
        farmId: FARM,
        name,
        tagNumber: tag,
        birthDate: '2022-01-01',
        birthDateIsEstimated: false,
        breed: null,
        motherId: null,
        calvingCount: 1,
        lactationStatus: 'lactating',
        pregnancyStatus: 'pregnant',
      },
      'user-1',
    ).id;
  }

  beforeEach(() => {
    driver = createMigratedTestDb();
    seedFarm(driver);
    cowId = makeCow('Lola', 'A-01');
  });

  afterEach(() => driver.close());

  it('returns no reminders for a quiet herd', () => {
    expect(computeReminders(driver, FARM, TODAY)).toHaveLength(0);
  });

  it('reminds about active milk withdrawals', () => {
    createHealthEvent(
      driver,
      {
        farmId: FARM,
        cowId,
        eventDate: TODAY,
        eventType: 'treatment',
        description: 'Antibiótico',
        withdrawalUntil: '2026-07-06',
      },
      'user-1',
    );
    const reminders = computeReminders(driver, FARM, TODAY);
    expect(reminders).toEqual([
      expect.objectContaining({ kind: 'withdrawal_active', cowId, dueDate: '2026-07-06' }),
    ]);
    // Expired withdrawal disappears.
    expect(computeReminders(driver, FARM, '2026-07-07')).toHaveLength(0);
  });

  it('reminds about upcoming calving and drying-off from the insemination date', () => {
    // Insemination on 2025-10-10 → calving 2026-07-20 (18 days away, inside
    // the 21-day window on TODAY), dry-off 2026-05-21 (already past).
    createReproEvent(
      driver,
      {
        farmId: FARM,
        cowId,
        eventDate: '2025-10-10',
        eventType: 'insemination',
        result: null,
        notes: null,
      },
      'user-1',
    );
    // A pregnancy check keeps the cycle open and silences the check reminder.
    createReproEvent(
      driver,
      {
        farmId: FARM,
        cowId,
        eventDate: '2025-11-20',
        eventType: 'pregnancy_check',
        result: 'pregnant',
        notes: null,
      },
      'user-1',
    );

    const reminders = computeReminders(driver, FARM, TODAY);
    expect(reminders.map((r) => r.kind)).toEqual(['drying_off', 'calving_upcoming']);
    expect(reminders[0]).toEqual(expect.objectContaining({ dueDate: '2026-05-21' }));
    expect(reminders[1]).toEqual(expect.objectContaining({ dueDate: '2026-07-20' }));

    // Once dried (lactation set to dry), the drying-off reminder goes away.
    updateCow(driver, cowId, { lactationStatus: 'dry' });
    expect(computeReminders(driver, FARM, TODAY).map((r) => r.kind)).toEqual(['calving_upcoming']);

    // Far from calving (>21 days and dry-off >14 days ahead) there is nothing.
    expect(computeReminders(driver, FARM, '2026-01-10')).toHaveLength(0);
  });

  it('reminds about pregnancy checks 30 days after an unchecked insemination', () => {
    createReproEvent(
      driver,
      {
        farmId: FARM,
        cowId,
        eventDate: '2026-05-20',
        eventType: 'insemination',
        result: null,
        notes: null,
      },
      'user-1',
    );
    // 29 days later: not yet due.
    expect(computeReminders(driver, FARM, '2026-06-18')).toHaveLength(0);
    // 43 days later: due since 2026-06-19.
    const due = computeReminders(driver, FARM, TODAY);
    expect(due).toEqual([
      expect.objectContaining({ kind: 'pregnancy_check_due', cowId, dueDate: '2026-06-19' }),
    ]);

    // Recording the check clears it.
    createReproEvent(
      driver,
      {
        farmId: FARM,
        cowId,
        eventDate: TODAY,
        eventType: 'pregnancy_check',
        result: 'open',
        notes: null,
      },
      'user-1',
    );
    expect(
      computeReminders(driver, FARM, TODAY).filter((r) => r.kind === 'pregnancy_check_due'),
    ).toHaveLength(0);
  });

  it('ignores non-active cows entirely', () => {
    createHealthEvent(
      driver,
      {
        farmId: FARM,
        cowId,
        eventDate: TODAY,
        eventType: 'treatment',
        description: 'x',
        withdrawalUntil: '2026-07-10',
      },
      'user-1',
    );
    setLifecycleStatus(driver, cowId, 'sold');
    expect(computeReminders(driver, FARM, TODAY)).toHaveLength(0);
  });
});
