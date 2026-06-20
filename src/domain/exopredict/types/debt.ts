/**
 * ExoPredict PRO — Debts
 * Step 1: Domain Foundation
 *
 * CRITICAL RULES:
 * - Contract numbers, debt IDs, AFMs are always string (leading-zero safe).
 * - null = unknown/unavailable. 0 = explicitly zero. Never conflate the two.
 * - Debt category must NOT be inferred from creditor, amount, or contract number.
 * - Money is always integer euro cents.
 */

import type { DebtId, MoneyAmount, CurrencyCode } from "./primitives";
import type { SourceReference, VerificationStatus } from "./source";

export type DebtCategory =
  | "MORTGAGE"
  | "CONSUMER"
  | "BUSINESS"
  | "CREDIT_CARD"
  | "LEASING"
  | "OTHER"
  | "UNKNOWN";

export interface Debt {
  readonly debtId: DebtId;

  /** Normalized creditor/servicer key (e.g. "ALPHA_BANK", "INTRUM_GR") — not raw name */
  readonly creditorKey: string;
  /** Human label for claimant or beneficiary as it appears in source */
  readonly claimantLabel: string | null;

  /**
   * Contract number — always string.
   * Must preserve leading zeros. Never cast to number.
   */
  readonly contractNumber: string | null;

  /**
   * Debt identity reference (e.g. Tiresias code, loan ID from source file).
   * Always string.
   */
  readonly debtIdentityRef: string | null;

  readonly currency: CurrencyCode;

  /** Principal amount in euro cents — null if source does not distinguish */
  readonly principalAmountCents: MoneyAmount;

  /** Overdue interest in euro cents — null if source does not distinguish */
  readonly overdueInterestCents: MoneyAmount;

  /** Total debt in euro cents */
  readonly totalDebtCents: MoneyAmount;

  /**
   * Category — only populated when explicitly confirmed by source or manual entry.
   * Never inferred.
   */
  readonly category: DebtCategory;

  /** Whether this debt is included in the extrajudicial application */
  readonly regulatedParticipation: boolean | null;

  readonly sourceRef: SourceReference | null;
  readonly verificationStatus: VerificationStatus;
}
