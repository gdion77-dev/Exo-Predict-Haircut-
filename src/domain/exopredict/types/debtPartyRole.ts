/**
 * ExoPredict PRO — Debt Party Role Mapping
 * Step 1: Domain Foundation
 *
 * CRITICAL RULES:
 * - Co-debtor is NOT automatically linked to all debts. Each mapping is per-debt.
 * - CO_DEBTOR, GUARANTOR, and THIRD_PARTY_COLLATERAL_PROVIDER are distinct roles.
 * - participatedInApplication and signedContract are independent booleans.
 */

import type { DebtId, PersonId } from "./primitives";
import type { SourceReference } from "./source";

export type DebtPartyRoleType =
  | "PRIMARY_DEBTOR"
  | "CO_DEBTOR"
  | "GUARANTOR"
  | "THIRD_PARTY_COLLATERAL_PROVIDER"
  | "OTHER";

export interface DebtPartyRole {
  /** Internal mapping ID */
  readonly mappingId: string;
  readonly debtId: DebtId;
  readonly personId: PersonId;
  readonly role: DebtPartyRoleType;
  /** Did this person participate in the extrajudicial application? null = unknown */
  readonly participatedInApplication: boolean | null;
  /** Did this person sign or co-sign the final contract? null = unknown */
  readonly signedContract: boolean | null;
  /**
   * Does this person benefit from the restructuring terms?
   * null = unknown or not yet determined.
   */
  readonly benefitsFromRestructuring: boolean | null;
  readonly sourceRef: SourceReference | null;
}
