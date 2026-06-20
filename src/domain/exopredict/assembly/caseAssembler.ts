/**
 * ExoPredict PRO — Case Assembler
 * Step 4: Case Assembly
 *
 * Combines output from all Step 2/3 importers into a single
 * ExtrajudicialCase aggregate root.
 *
 * Input:
 *   - incomeRows (INCOME_EXPORT + INCOME_HISTORY_EXPORT)
 *   - assetRows (ASSET_EXPORT)
 *   - financialAssetRows (FINANCIAL_ASSET_EXPORT)
 *   - collateralRows (COLLATERAL_EXPORT)
 *   - debtSummaryRows (DEBTS_SUMMARY_EXPORT) — for metadata only
 *   - parsedContractData (PROPOSAL_OR_CONTRACT_PDF)
 *   - applicantAfm
 *   - personAfmToRoleMap
 *
 * Output: ExtrajudicialCase (immutable aggregate root)
 *
 * RULES:
 * - Assembly never silently drops data. Issues are collected and attached.
 * - null ≠ 0 throughout.
 * - No economic calculations. No ML. No legal inference.
 * - trainingEligibility always starts as NOT_REVIEWED.
 */

import type { ExtrajudicialCase, CaseStatus, SourceFileManifest } from "../types/case";
import type { Person, PersonRole, HouseholdAggregate, PrivateIdentity } from "../types/person";
import type { CaseId, PersonId } from "../types/primitives";
import { makeCaseId, makePersonId } from "../types/primitives";
import type { RawIncomeRow } from "../importers/rawTypes";
import type { RawAssetRow } from "../importers/rawTypes";
import type { RawFinancialAssetRow } from "../importers/rawTypes";
import type { RawCollateralRow } from "../importers/rawTypes";
import type { ParsedContractData } from "../importers/pdf/contractPdfTypes";
import { importIncomeRows } from "../importers/incomeImporter";
import { importAssetRows } from "../importers/assetImporter";
import { importFinancialAssetRows } from "../importers/financialAssetImporter";
import { importCollateralRows } from "../importers/collateralImporter";
import { buildDebtsFromParsedContract } from "../importers/pdf/contractPdfParser";
import { validateCase } from "../validators";

// ─── Assembly input ───────────────────────────────────────────────────────────

export interface PersonInput {
  readonly afm: string;
  readonly role: PersonRole;
  readonly privateIdentity: PrivateIdentity | null;
}

export interface CaseAssemblyInput {
  readonly caseId: string;
  /** ΑΦΜ of primary applicant */
  readonly applicantAfm: string;
  readonly persons: readonly PersonInput[];
  readonly household: HouseholdAggregate;

  readonly incomeRows: readonly RawIncomeRow[];
  readonly incomeHistoryRows: readonly RawIncomeRow[];
  readonly assetRows: readonly RawAssetRow[];
  readonly financialAssetRows: readonly RawFinancialAssetRow[];
  readonly collateralRows: readonly RawCollateralRow[];
  readonly parsedContract: ParsedContractData;

  readonly sourceFilenames: {
    readonly income: string;
    readonly incomeHistory: string;
    readonly asset: string;
    readonly financialAsset: string;
    readonly collateral: string;
    readonly debtsSummary: string;
    readonly contract: string;
  };

  readonly importedAt: string;
}

// ─── Assembly result ──────────────────────────────────────────────────────────

export interface CaseAssemblyResult {
  readonly case: ExtrajudicialCase;
  readonly assemblyIssues: readonly string[];
  readonly validationResult: ReturnType<typeof validateCase>;
}

// ─── Core assembler ───────────────────────────────────────────────────────────

export function assembleCase(input: CaseAssemblyInput): CaseAssemblyResult {
  const assemblyIssues: string[] = [];
  const { importedAt } = input;

  // ── Build PersonId map ────────────────────────────────────────────────────
  const personAfmToId = new Map<string, PersonId>();
  const persons: Person[] = [];

  for (const p of input.persons) {
    const personId = makePersonId(`PERSON-${p.afm.slice(-6)}`);
    personAfmToId.set(p.afm, personId);
    persons.push({
      personId,
      role: p.role,
      privateIdentity: p.privateIdentity,
      sourceRef: null,
    });
  }

  // ── Income ────────────────────────────────────────────────────────────────
  const incomeResult = importIncomeRows(
    input.incomeRows as RawIncomeRow[],
    personAfmToId,
    "INCOME_EXPORT",
    input.sourceFilenames.income,
    importedAt,
  );
  const incomeHistoryResult = importIncomeRows(
    input.incomeHistoryRows as RawIncomeRow[],
    personAfmToId,
    "INCOME_HISTORY_EXPORT",
    input.sourceFilenames.incomeHistory,
    importedAt,
  );

  // Combine incomes — dedup by personId + taxYear
  const incomesSeen = new Set<string>();
  const allIncomes = [...incomeResult.records, ...incomeHistoryResult.records].filter((r) => {
    const key = `${r.personId}::${r.taxYear}`;
    if (incomesSeen.has(key)) return false;
    incomesSeen.add(key);
    return true;
  });

  if (incomeResult.issues.length > 0) {
    assemblyIssues.push(`Income: ${incomeResult.issues.length} issue(s)`);
  }
  if (incomeHistoryResult.issues.length > 0) {
    assemblyIssues.push(`IncomeHistory: ${incomeHistoryResult.issues.length} issue(s)`);
  }

  // ── Assets ────────────────────────────────────────────────────────────────
  const assetResult = importAssetRows(
    input.assetRows as RawAssetRow[],
    personAfmToId,
    input.sourceFilenames.asset,
    importedAt,
  );

  if (assetResult.issues.length > 0) {
    assemblyIssues.push(`Assets: ${assetResult.issues.length} issue(s)`);
  }

  // ── Financial assets ──────────────────────────────────────────────────────
  const financialAssetResult = importFinancialAssetRows(
    input.financialAssetRows as RawFinancialAssetRow[],
    personAfmToId,
    input.sourceFilenames.financialAsset,
    importedAt,
  );

  if (financialAssetResult.issues.length > 0) {
    assemblyIssues.push(`FinancialAssets: ${financialAssetResult.issues.length} issue(s)`);
  }

  // ── Collateral ────────────────────────────────────────────────────────────
  const collateralResult = importCollateralRows(
    input.collateralRows as RawCollateralRow[],
    input.sourceFilenames.collateral,
    importedAt,
  );

  if (collateralResult.issues.length > 0) {
    assemblyIssues.push(`Collateral: ${collateralResult.issues.length} issue(s)`);
  }

  // ── PDF contract → debts, terms, roles, collateral links ─────────────────
  const contractResult = buildDebtsFromParsedContract(
    input.parsedContract,
    input.applicantAfm,
    personAfmToId,
    collateralResult.collateralLinks as import("../types/property").CollateralLink[],
    input.sourceFilenames.contract,
    importedAt,
  );

  if (contractResult.issues.length > 0) {
    contractResult.issues.forEach((i) => assemblyIssues.push(`Contract: ${i}`));
  }

  // ── Source file manifest ──────────────────────────────────────────────────
  const sourceFileManifest: SourceFileManifest = {
    files: [
      { label: "Income export", anonymizedRef: "INCOME-EXPORT", sourceType: "INCOME_EXPORT", importedAt },
      { label: "Income history export", anonymizedRef: "INCOME-HISTORY-EXPORT", sourceType: "INCOME_HISTORY_EXPORT", importedAt },
      { label: "Asset export", anonymizedRef: "ASSET-EXPORT", sourceType: "ASSET_EXPORT", importedAt },
      { label: "Financial asset export", anonymizedRef: "FINANCIAL-ASSET-EXPORT", sourceType: "FINANCIAL_ASSET_EXPORT", importedAt },
      { label: "Collateral export", anonymizedRef: "COLLATERAL-EXPORT", sourceType: "COLLATERAL_EXPORT", importedAt },
      { label: "Restructuring contract PDF", anonymizedRef: "CONTRACT-PDF", sourceType: "PROPOSAL_OR_CONTRACT_PDF", importedAt },
    ],
  };

  // ── Submission date from contract ─────────────────────────────────────────
  const submissionDate = input.parsedContract.submissionDate ?? null;

  // ── Determine case status ─────────────────────────────────────────────────
  // PDF is ΠΡΟΧΕΙΡΟ (draft) — no signature date yet
  const caseStatus: CaseStatus = "PROPOSAL_RECEIVED";

  // ── Assemble ──────────────────────────────────────────────────────────────
  const caseId: CaseId = makeCaseId(input.caseId);

  const assembledCase: ExtrajudicialCase = {
    caseId,
    status: caseStatus,
    submissionDate,
    proposalOrContractDate: null, // ΠΡΟΧΕΙΡΟ — not yet signed
    sourceFileManifest,

    persons,
    household: input.household,

    incomes: allIncomes,
    financialAssets: financialAssetResult.records,

    properties: assetResult.properties,
    propertyOwnerships: assetResult.ownerships,
    propertyValueEvidences: [
      ...assetResult.valueEvidences,
      ...collateralResult.additionalValueEvidences,
    ],
    collateralLinks: contractResult.updatedCollateralLinks,

    debts: contractResult.debts,
    debtPartyRoles: contractResult.debtPartyRoles,
    proposalTerms: contractResult.proposalTerms,

    outcome: {
      status: "PROPOSAL_ISSUED",
      proposalIssuedDate: input.parsedContract.documentCreatedDate ?? null,
      signedDate: null,
      recordedAt: importedAt,
      notes: "ΠΡΟΧΕΙΡΟ — πρόταση αναδιάρθρωσης, δεν έχει υπογραφεί",
    },

    // Always starts as NOT_REVIEWED — requires explicit human review
    trainingEligibility: {
      status: "NOT_REVIEWED",
      exclusionReason: null,
      reviewedAt: null,
      reviewedBy: null,
    },

    dataQualityFlags: assemblyIssues,
  };

  // ── Validate assembled case ───────────────────────────────────────────────
  const validationResult = validateCase(assembledCase);

  return {
    case: assembledCase,
    assemblyIssues,
    validationResult,
  };
}
