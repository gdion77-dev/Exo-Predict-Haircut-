/**
 * ExoPredict PRO — ExtrajudicialCase Aggregate Root
 * Step 1: Domain Foundation
 *
 * This is the canonical domain aggregate for a Ν.4738/2020 case.
 * All child entities are embedded for the domain layer.
 * Persistence, serialization, and indexing are out of scope for Step 1.
 */

import type { CaseId, ISODateString } from "./primitives";
import type { Person, HouseholdAggregate } from "./person";
import type { Debt } from "./debt";
import type { DebtPartyRole } from "./debtPartyRole";
import type {
  Property,
  PropertyOwnership,
  PropertyValueEvidence,
  CollateralLink,
} from "./property";
import type { IncomeRecord, FinancialAsset } from "./incomeAndAssets";
import type { ProposalDebtTerms } from "./proposal";
import type { CaseOutcome, TrainingCaseEligibility } from "./outcome";

export type CaseStatus =
  | "DRAFT"
  | "DATA_COLLECTION"
  | "UNDER_REVIEW"
  | "PROPOSAL_RECEIVED"
  | "CONTRACT_SIGNED"
  | "CLOSED"
  | "ARCHIVED";

/** Manifest of source files associated with a case */
export interface SourceFileManifest {
  readonly files: ReadonlyArray<{
    readonly label: string;
    /** Anonymized reference — must NOT contain personal identifiers */
    readonly anonymizedRef: string;
    readonly sourceType: string;
    readonly importedAt: string;
  }>;
}

/**
 * ExtrajudicialCase — canonical aggregate root.
 *
 * Invariants:
 * - caseId is unique per case.
 * - All monetary values in child records are integer euro cents.
 * - External identifiers (AFM, contract numbers) are always strings.
 * - PII is isolated in Person.privateIdentity (optional, never in projection).
 * - Collateral linking is many-to-many; properties must not be double-counted.
 * - Proposal terms exist per debt, not only at case level.
 * - A SIGNED outcome does NOT imply ELIGIBLE_VERIFIED training status.
 */
export interface ExtrajudicialCase {
  readonly caseId: CaseId;
  readonly status: CaseStatus;
  readonly submissionDate: ISODateString | null;
  readonly proposalOrContractDate: ISODateString | null;
  readonly sourceFileManifest: SourceFileManifest;

  readonly persons: readonly Person[];
  readonly household: HouseholdAggregate;

  readonly incomes: readonly IncomeRecord[];
  readonly financialAssets: readonly FinancialAsset[];

  readonly properties: readonly Property[];
  readonly propertyOwnerships: readonly PropertyOwnership[];
  readonly propertyValueEvidences: readonly PropertyValueEvidence[];
  readonly collateralLinks: readonly CollateralLink[];

  readonly debts: readonly Debt[];
  readonly debtPartyRoles: readonly DebtPartyRole[];
  readonly proposalTerms: readonly ProposalDebtTerms[];

  readonly outcome: CaseOutcome;
  readonly trainingEligibility: TrainingCaseEligibility;

  /** Overall data quality issues detected */
  readonly dataQualityFlags: readonly string[];
}
