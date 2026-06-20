/**
 * ExoPredict PRO — Training-Safe Case Projection
 * Step 1: Domain Foundation
 *
 * This module provides the types and pure function for producing a
 * training-safe projection of a case — suitable for future ML pipelines.
 *
 * MANDATORY STRIP LIST (never present in projection):
 *   - Full names
 *   - AFM (Tax Identification Numbers)
 *   - Addresses
 *   - IBAN
 *   - Contract numbers
 *   - Debt identity references
 *   - Filenames containing personal identifiers
 *   - Raw person IDs that could identify a natural person
 *
 * The projection retains only anonymous aggregates and normalized keys.
 */

import type { CaseId, MoneyAmount, CurrencyCode } from "./primitives";
import type { CaseOutcomeStatus, TrainingEligibilityStatus } from "./outcome";
import type { ExtrajudicialCase } from "./case";

// ─── Projection types ─────────────────────────────────────────────────────────

export interface TrainingSafeDebtSummary {
  /** Normalized creditor/servicer key — not a raw name or contract number */
  readonly creditorKey: string;
  readonly category: string;
  readonly totalDebtCents: MoneyAmount;
  readonly currency: CurrencyCode;
  readonly regulatedParticipation: boolean | null;
}

export interface TrainingSafeProposalSummary {
  readonly creditorKey: string;
  readonly totalDebtBeforeCents: MoneyAmount;
  readonly writeOffAmountCents: MoneyAmount;
  readonly finalRegulatedAmountCents: MoneyAmount;
  readonly rateMode: string;
  readonly paymentTermMonths: number | null;
}

export interface TrainingSafePropertySummary {
  readonly propertyType: string;
  readonly areaLabel: string | null;
  /** Market value — null if not documented. NEVER populated by fallback. */
  readonly marketValueCents: MoneyAmount;
  readonly objectiveValueCents: MoneyAmount;
  readonly currency: CurrencyCode;
}

export interface TrainingSafeCaseProjection {
  /** Internal case ID — opaque, not traceable to AFM or person */
  readonly internalCaseId: CaseId;

  readonly submissionYear: number | null;
  readonly proposalYear: number | null;

  readonly householdSize: number | null;
  readonly dependentChildrenCount: number | null;
  readonly spouseOrPartnerPresent: boolean | null;
  readonly participatingCoDebtorCount: number | null;
  readonly nonParticipatingCoDebtorCount: number | null;

  readonly debts: readonly TrainingSafeDebtSummary[];
  readonly proposalTerms: readonly TrainingSafeProposalSummary[];
  readonly properties: readonly TrainingSafePropertySummary[];

  readonly totalIncomeCents: MoneyAmount;
  readonly totalDebtCents: MoneyAmount;
  readonly totalCollateralCoveredDebtIds: number;

  readonly outcomeStatus: CaseOutcomeStatus;
  readonly trainingEligibility: TrainingEligibilityStatus;
}

// ─── Pure projection function ─────────────────────────────────────────────────

/**
 * Produces a TrainingSafeCaseProjection from a full ExtrajudicialCase.
 * Pure function — no side effects, no mutations, no I/O.
 * Guarantees no PII leaks by construction.
 */
export function projectTrainingSafe(c: ExtrajudicialCase): TrainingSafeCaseProjection {
  const submissionYear = c.submissionDate
    ? new Date(c.submissionDate).getFullYear()
    : null;
  const proposalYear = c.proposalOrContractDate
    ? new Date(c.proposalOrContractDate).getFullYear()
    : null;

  const totalIncomeCents: MoneyAmount =
    c.incomes.length === 0
      ? null
      : c.incomes.reduce<number | null>((acc, inc) => {
          if (acc === null || inc.netAmountCents === null) return null;
          return acc + inc.netAmountCents;
        }, 0);

  const totalDebtCents: MoneyAmount =
    c.debts.length === 0
      ? null
      : c.debts.reduce<number | null>((acc, d) => {
          if (acc === null || d.totalDebtCents === null) return null;
          return acc + d.totalDebtCents;
        }, 0);

  const coveredDebtIdSet = new Set<string>();
  c.collateralLinks.forEach((cl) =>
    cl.coveredDebtIds.forEach((id) => coveredDebtIdSet.add(id))
  );

  const safeDebts: TrainingSafeDebtSummary[] = c.debts.map((d) => ({
    creditorKey: d.creditorKey,
    category: d.category,
    totalDebtCents: d.totalDebtCents,
    currency: d.currency,
    regulatedParticipation: d.regulatedParticipation,
  }));

  const safeProposals: TrainingSafeProposalSummary[] = c.proposalTerms.map((p) => {
    const debt = c.debts.find((d) => d.debtId === p.debtId);
    return {
      creditorKey: debt?.creditorKey ?? "UNKNOWN",
      totalDebtBeforeCents: p.totalDebtBeforeCents,
      writeOffAmountCents: p.writeOffAmountCents,
      finalRegulatedAmountCents: p.finalRegulatedAmountCents,
      rateMode: p.rateMode,
      paymentTermMonths: p.paymentTermMonths,
    };
  });

  const safeProperties: TrainingSafePropertySummary[] = c.properties.map((prop) => {
    const evidences = c.propertyValueEvidences.filter(
      (e) => e.propertyId === prop.propertyId
    );
    const marketEvidence = evidences.find(
      (e) => e.valueType === "MARKET_VALUE_ESTIMATE"
    );
    const objectiveEvidence = evidences.find(
      (e) => e.valueType === "OBJECTIVE_VALUE"
    );
    return {
      propertyType: prop.propertyType,
      areaLabel: prop.areaLabel,
      // null if no MARKET_VALUE_ESTIMATE found — NEVER falls back to creditor value
      marketValueCents: marketEvidence?.amountCents ?? null,
      objectiveValueCents: objectiveEvidence?.amountCents ?? null,
      currency: "EUR",
    };
  });

  return {
    internalCaseId: c.caseId,
    submissionYear,
    proposalYear,
    householdSize: c.household.householdSize,
    dependentChildrenCount: c.household.dependentChildrenCount,
    spouseOrPartnerPresent: c.household.spouseOrPartnerPresent,
    participatingCoDebtorCount: c.household.participatingCoDebtorCount,
    nonParticipatingCoDebtorCount: c.household.nonParticipatingCoDebtorCount,
    debts: safeDebts,
    proposalTerms: safeProposals,
    properties: safeProperties,
    totalIncomeCents,
    totalDebtCents,
    totalCollateralCoveredDebtIds: coveredDebtIdSet.size,
    outcomeStatus: c.outcome.status,
    trainingEligibility: c.trainingEligibility.status,
  };
}
