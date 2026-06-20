/**
 * ExoPredict PRO — Proposal / Contract Terms
 * Step 1: Domain Foundation
 *
 * CRITICAL RULES:
 * - Terms are stored PER DEBT, not only as case-level aggregates.
 * - Haircut percentage is NOT calculated here. Raw amounts only.
 * - Rate mode must be explicitly declared; never inferred.
 * - Public/social-security classification only when source confirms.
 */

import type { DebtId, MoneyAmount, CurrencyCode } from "./primitives";
import type { SourceReference, VerificationStatus } from "./source";

export type RateMode = "FIXED" | "FLOATING" | "UNKNOWN";

export interface ProposalDebtTerms {
  readonly termId: string;
  /** References the Debt this term applies to */
  readonly debtId: DebtId;

  /** Total debt before restructuring in euro cents */
  readonly totalDebtBeforeCents: MoneyAmount;

  /** Amount written off / forgiven in euro cents — null if not specified */
  readonly writeOffAmountCents: MoneyAmount;

  /** Final regulated amount in euro cents */
  readonly finalRegulatedAmountCents: MoneyAmount;

  readonly currency: CurrencyCode;

  readonly rateMode: RateMode;

  /**
   * Rate base (e.g. "EURIBOR_3M", "ECB_MAIN_REFI").
   * Only for FLOATING mode. null for FIXED or UNKNOWN.
   */
  readonly rateBase: string | null;

  /**
   * Spread in basis points (integer). null if unknown.
   * e.g. 150 = 1.50%
   */
  readonly spreadBasisPoints: number | null;

  /**
   * Fixed rate in basis points. null for FLOATING or UNKNOWN.
   * e.g. 200 = 2.00%
   */
  readonly fixedRateBasisPoints: number | null;

  /** Repayment term in months */
  readonly paymentTermMonths: number | null;

  /** Upfront / balloon payment in euro cents — null if none or unknown */
  readonly upfrontPaymentCents: MoneyAmount;

  /** Estimated periodic installment amount in euro cents — null if unknown */
  readonly installmentAmountCents: MoneyAmount;

  /**
   * Is this debt classified as a public/social-security obligation?
   * Only true when explicitly confirmed in source. Never inferred.
   */
  readonly isPublicOrSocialSecurityDebt: boolean | null;

  readonly sourceRef: SourceReference | null;
  readonly verificationStatus: VerificationStatus;
}
