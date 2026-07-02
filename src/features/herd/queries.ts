import type { SqlDriver } from '@/db/driver';
import { ageFromBirthDate, todayIsoDate } from '@/lib/dates';
import { strings } from '@/lib/i18n/strings';
import { getCow, listCows, listDaughters } from '@/repositories/cows';
import {
  dayDeltaForCow,
  farmSevenDayTrend,
  farmTotalForDate,
  sevenDayTrendForCow,
  type DayDelta,
  type TrendPoint,
} from '@/repositories/milk';
import type { Cow } from '@/types/domain';

/**
 * Read models for the herd screens. All values are derived on read from
 * milk_records and birth_date (D-006/D-007); nothing here is stored.
 */

export interface CowCardData {
  cow: Cow;
  today: number;
  delta: DayDelta;
  trend: TrendPoint[];
}

export function loadCowCard(driver: SqlDriver, cowId: string, date?: string): CowCardData | null {
  const cow = getCow(driver, cowId);
  if (!cow) return null;
  const isoDate = date ?? todayIsoDate();
  const delta = dayDeltaForCow(driver, cowId, isoDate);
  return {
    cow,
    today: delta.today,
    delta,
    trend: sevenDayTrendForCow(driver, cowId, isoDate),
  };
}

export function loadCowCards(driver: SqlDriver, farmId: string, search?: string): CowCardData[] {
  const isoDate = todayIsoDate();
  return listCows(driver, farmId, search).map((cow) => {
    const delta = dayDeltaForCow(driver, cow.id, isoDate);
    return {
      cow,
      today: delta.today,
      delta,
      trend: sevenDayTrendForCow(driver, cow.id, isoDate),
    };
  });
}

export interface FarmSummaryData {
  total: number;
  yesterdayTotal: number;
  trend: TrendPoint[];
  cards: CowCardData[];
}

export function loadFarmSummary(driver: SqlDriver, farmId: string): FarmSummaryData {
  const isoDate = todayIsoDate();
  const trend = farmSevenDayTrend(driver, farmId, isoDate);
  return {
    total: farmTotalForDate(driver, farmId, isoDate),
    yesterdayTotal: trend.at(-2)?.total ?? 0,
    trend,
    cards: loadCowCards(driver, farmId),
  };
}

export interface GenealogyData {
  mother: Cow | null;
  daughters: Cow[];
}

export function loadGenealogy(driver: SqlDriver, cow: Cow): GenealogyData {
  return {
    mother: cow.motherId ? getCow(driver, cow.motherId) : null,
    daughters: listDaughters(driver, cow.id),
  };
}

/** "4 años 2 meses" | "8 meses" | "Sin fecha" — always derived (D-006). */
export function formatAge(birthDate: string | null): string {
  const age = ageFromBirthDate(birthDate);
  if (!age) return strings.herd.unknownAge;
  if (age.years === 0) return `${age.months} ${strings.herd.months}`;
  if (age.months === 0) return `${age.years} ${strings.herd.years}`;
  return `${age.years} ${strings.herd.years} ${age.months} ${strings.herd.months}`;
}

export function formatLiters(value: number): string {
  return (Math.round(value * 10) / 10).toString();
}
