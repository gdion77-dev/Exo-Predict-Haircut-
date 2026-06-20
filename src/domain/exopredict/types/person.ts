/**
 * ExoPredict PRO — Persons & Household
 * Step 1: Domain Foundation
 *
 * CRITICAL RULES:
 * - PII (name, AFM, address, IBAN) is isolated in optional PrivateIdentity.
 * - PrivateIdentity is NEVER included in TrainingSafeCaseProjection.
 * - Training features use only anonymous household aggregates.
 * - Minor children ages and names must never become training features.
 */

import type { PersonId, ISODateString } from "./primitives";
import type { SourceReference } from "./source";

export type PersonRole =
  | "APPLICANT"
  | "SPOUSE_OR_PARTNER"
  | "DEPENDENT_CHILD"
  | "MINOR_CHILD"
  | "CO_DEBTOR"
  | "GUARANTOR"
  | "THIRD_PARTY_COLLATERAL_PROVIDER"
  | "CO_BENEFICIARY_FINANCIAL_ASSET"
  | "OTHER_RELATED_PERSON";

/**
 * Private identity data — PII container.
 * Must be stripped before any training-safe export.
 */
export interface PrivateIdentity {
  readonly fullName: string | null;
  /** Greek AFM — always stored as string to preserve leading zeros */
  readonly afm: string | null;
  readonly address: string | null;
  readonly dateOfBirth: ISODateString | null;
}

export interface Person {
  readonly personId: PersonId;
  readonly role: PersonRole;
  /**
   * Optional PII — present only for case management, never for analytics.
   * Absence of this field does NOT mean the person is unknown.
   */
  readonly privateIdentity: PrivateIdentity | null;
  readonly sourceRef: SourceReference | null;
}

/**
 * Household aggregate — training-safe, no PII.
 * All counts are null if unknown, not 0.
 */
export interface HouseholdAggregate {
  readonly householdSize: number | null;
  readonly dependentChildrenCount: number | null;
  readonly minorChildrenCount: number | null;
  readonly spouseOrPartnerPresent: boolean | null;
  readonly participatingCoDebtorCount: number | null;
  readonly nonParticipatingCoDebtorCount: number | null;
}
