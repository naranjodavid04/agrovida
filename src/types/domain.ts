/**
 * Shared domain types. Statuses are independent dimensions (DECISIONS.md D-005):
 * a cow may be lactating and pregnant at the same time.
 */

export type LifecycleStatus = 'active' | 'sold' | 'deceased' | 'culled';
export type LactationStatus = 'lactating' | 'dry' | 'unknown';
export type PregnancyStatus = 'pregnant' | 'open' | 'unknown';
export type MilkSession = 'morning' | 'afternoon';
export type FarmRole = 'owner' | 'worker';
export type MembershipStatus = 'active' | 'inactive';
export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface Farm {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface FarmMember {
  id: string;
  farmId: string;
  userId: string;
  role: FarmRole;
  membershipStatus: MembershipStatus;
  createdAt: string;
}

export interface FarmInvite {
  id: string;
  farmId: string;
  normalizedEmail: string;
  role: FarmRole;
  status: InviteStatus;
  expiresAt: string;
  createdBy: string;
  createdAt: string;
}

export interface Cow {
  id: string;
  farmId: string;
  name: string;
  tagNumber: string | null;
  /** Remote storage path once uploaded; local URI while pending (D-010). */
  photoPath: string | null;
  photoLocalUri: string | null;
  /** ISO date (YYYY-MM-DD). Age is always derived from this (D-006). */
  birthDate: string | null;
  birthDateIsEstimated: boolean;
  breed: string | null;
  motherId: string | null;
  calvingCount: number;
  lifecycleStatus: LifecycleStatus;
  lactationStatus: LactationStatus;
  pregnancyStatus: PregnancyStatus;
  createdBy: string;
  createdAt: string;
  deletedAt: string | null;
}

export type HealthEventType = 'treatment' | 'vaccination' | 'illness' | 'checkup' | 'other';
export type ReproEventType = 'heat' | 'insemination' | 'pregnancy_check' | 'calving' | 'abortion';
export type PregnancyCheckResult = 'pregnant' | 'open';

export interface HealthEvent {
  id: string;
  farmId: string;
  cowId: string;
  /** ISO date (YYYY-MM-DD). */
  eventDate: string;
  eventType: HealthEventType;
  description: string;
  /** Milk must be discarded until this date (inclusive), when present. */
  withdrawalUntil: string | null;
  recordedBy: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface ReproEvent {
  id: string;
  farmId: string;
  cowId: string;
  eventDate: string;
  eventType: ReproEventType;
  result: PregnancyCheckResult | null;
  notes: string | null;
  recordedBy: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface MilkRecord {
  id: string;
  farmId: string;
  cowId: string;
  /** ISO date (YYYY-MM-DD), farm-local. */
  recordDate: string;
  session: MilkSession;
  liters: number;
  recordedBy: string;
  createdAt: string;
  deletedAt: string | null;
}
