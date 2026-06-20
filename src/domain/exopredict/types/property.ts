/**
 * ExoPredict PRO — Property, Ownership, Value Evidence, Collateral
 * Step 1: Domain Foundation
 *
 * CRITICAL INVARIANTS:
 * 1. CREDITOR_COLLATERAL_VALUE ≠ MARKET_VALUE_ESTIMATE. Never auto-convert.
 * 2. If market value is unknown, store null and raise a data-quality flag.
 * 3. Auction/liquidation value is stored separately, never as market value.
 * 4. One property may cover many debts — never double-count.
 * 5. Ownership percentages per property should sum to ≤ 100%.
 */

import type {
  PropertyId,
  CollateralId,
  OwnershipId,
  PersonId,
  DebtId,
  MoneyAmount,
  CurrencyCode,
  ISODateString,
} from "./primitives";
import type { SourceReference, VerificationStatus } from "./source";

// ─── Property ────────────────────────────────────────────────────────────────

export type PropertyType =
  | "PRIMARY_RESIDENCE"
  | "SECONDARY_RESIDENCE"
  | "COMMERCIAL"
  | "LAND"
  | "PARKING"
  | "OTHER"
  | "UNKNOWN";

export interface Property {
  readonly propertyId: PropertyId;
  readonly propertyType: PropertyType;
  /** KAEK — always string, may contain leading zeros */
  readonly kaek: string | null;
  /** Municipality/area label — stripped of personal identifiers */
  readonly areaLabel: string | null;
  readonly sourceRef: SourceReference | null;
  readonly verificationStatus: VerificationStatus;
}

// ─── Ownership ───────────────────────────────────────────────────────────────

export interface PropertyOwnership {
  readonly ownershipId: OwnershipId;
  readonly propertyId: PropertyId;
  readonly personId: PersonId;
  /** Percentage as integer (0–100). null = unknown. */
  readonly ownershipPercentage: number | null;
  readonly sourceRef: SourceReference | null;
}

// ─── Property Value Evidence ──────────────────────────────────────────────────

export type PropertyValueType =
  | "OBJECTIVE_VALUE"
  | "CREDITOR_COLLATERAL_VALUE"
  | "MARKET_VALUE_ESTIMATE"
  | "LIQUIDATION_OR_AUCTION_VALUE";

export type ValueConfidence = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export interface PropertyValueRange {
  readonly minCents: MoneyAmount;
  readonly maxCents: MoneyAmount;
}

export interface PropertyValueEvidence {
  readonly propertyId: PropertyId;
  readonly valueType: PropertyValueType;
  /**
   * Point estimate in euro cents — null if only a range is known.
   * Never populated by inference or fallback.
   */
  readonly amountCents: MoneyAmount;
  /** Range — null if a point estimate exists or if entirely unknown */
  readonly range: PropertyValueRange | null;
  readonly currency: CurrencyCode;
  readonly asOfDate: ISODateString | null;
  /** Free-text description of the valuation method or source label */
  readonly methodDescription: string | null;
  readonly confidence: ValueConfidence;
  readonly sourceRef: SourceReference | null;
  readonly verificationStatus: VerificationStatus;
}

// ─── Collateral Link ─────────────────────────────────────────────────────────

/**
 * Links a specific collateral record to one property and one or more debts.
 * Priority is per creditor and per collateral registration, stored as-found.
 */
export interface CollateralLink {
  readonly collateralId: CollateralId;
  readonly propertyId: PropertyId;
  /** Debt IDs covered by this collateral — must reference existing DebtIds */
  readonly coveredDebtIds: readonly DebtId[];
  /**
   * Registration priority (lien rank), e.g. 1 = first mortgage.
   * null = unknown. Stored as string if source uses non-numeric ranks.
   */
  readonly registrationPriority: number | null;
  readonly sourceRef: SourceReference | null;
  readonly verificationStatus: VerificationStatus;
}
