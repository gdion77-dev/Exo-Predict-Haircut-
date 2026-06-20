/**
 * ExoPredict PRO — Income & Financial Assets
 * Step 1: Domain Foundation
 *
 * Income records are sourced from INCOME_EXPORT or INCOME_HISTORY_EXPORT.
 * Financial assets from FINANCIAL_ASSET_EXPORT.
 * Money is always integer euro cents.
 */

import type { PersonId, MoneyAmount, CurrencyCode, ISODateString } from "./primitives";
import type { SourceReference, VerificationStatus } from "./source";

// ─── Income ──────────────────────────────────────────────────────────────────

export type IncomeCategory =
  | "EMPLOYMENT_SALARY"
  | "PENSION"
  | "RENTAL"
  | "BUSINESS_INCOME"
  | "AGRICULTURAL"
  | "DIVIDEND"
  | "OTHER"
  | "UNKNOWN";

export type IncomePeriodicity =
  | "MONTHLY"
  | "ANNUAL"
  | "ONE_OFF"
  | "UNKNOWN";

export interface IncomeRecord {
  readonly recordId: string;
  readonly personId: PersonId;
  readonly category: IncomeCategory;
  readonly periodicity: IncomePeriodicity;
  /** Net amount in euro cents. null = unknown. */
  readonly netAmountCents: MoneyAmount;
  /** Gross amount in euro cents. null = unknown. */
  readonly grossAmountCents: MoneyAmount;
  readonly taxYear: number | null;
  readonly asOfDate: ISODateString | null;
  readonly sourceRef: SourceReference | null;
  readonly verificationStatus: VerificationStatus;
}

// ─── Financial Asset ─────────────────────────────────────────────────────────

export type FinancialAssetType =
  | "BANK_DEPOSIT"
  | "SAVINGS_ACCOUNT"
  | "INVESTMENT_PORTFOLIO"
  | "INSURANCE_POLICY_CASH_VALUE"
  | "OTHER"
  | "UNKNOWN";

export interface FinancialAsset {
  readonly assetId: string;
  /** May be co-owned — list all person IDs */
  readonly personIds: readonly PersonId[];
  readonly assetType: FinancialAssetType;
  /** Balance in euro cents. null = unknown. */
  readonly balanceCents: MoneyAmount;
  readonly currency: CurrencyCode;
  readonly asOfDate: ISODateString | null;
  /**
   * Institution identifier — normalized key, not raw bank name.
   * Never store account numbers or IBAN here.
   */
  readonly institutionKey: string | null;
  readonly sourceRef: SourceReference | null;
  readonly verificationStatus: VerificationStatus;
}
