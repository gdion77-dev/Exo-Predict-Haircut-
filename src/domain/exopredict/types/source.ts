/**
 * ExoPredict PRO — Source Reference & Traceability
 * Step 1: Domain Foundation
 *
 * Every imported or manually entered record must carry a SourceReference
 * to enable full audit traceability.
 */

export type SourceType =
  | "INCOME_EXPORT"
  | "INCOME_HISTORY_EXPORT"
  | "ASSET_EXPORT"
  | "FINANCIAL_ASSET_EXPORT"
  | "COLLATERAL_EXPORT"
  | "DEBTS_SUMMARY_EXPORT"
  | "PROPOSAL_OR_CONTRACT_PDF"
  | "MANUAL_ENTRY";

export type VerificationStatus =
  | "UNVERIFIED"
  | "VERIFIED_AGAINST_SOURCE"
  | "MANUALLY_CONFIRMED"
  | "DISPUTED"
  | "UNKNOWN";

export interface SourceReference {
  readonly sourceType: SourceType;
  /** Original filename — must NOT be stored if it contains personal identifiers */
  readonly originalFilename: string | null;
  readonly sheetName: string | null;
  /** Row number or range as string, e.g. "12" or "12-15" */
  readonly rowReference: string | null;
  /** Page number for PDF sources */
  readonly pageReference: string | null;
  /** ISO timestamp of import or manual entry */
  readonly importedAt: string;
  readonly verificationStatus: VerificationStatus;
}
