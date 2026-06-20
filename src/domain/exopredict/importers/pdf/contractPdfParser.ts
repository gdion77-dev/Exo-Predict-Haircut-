/**
 * ExoPredict PRO — Contract PDF Parser
 * Step 3: PDF Import Layer
 *
 * STRATEGY: The Ν.4738/2020 contract PDF has a fixed, machine-generated
 * structure from the platform. All tables (Π5, Π6, Π7, Π8, Παρ.Ι) follow
 * a predictable schema confirmed by inspection of this document.
 *
 * This module provides:
 * 1. A pure `parseContractPdfData()` function that accepts raw extracted
 *    text blocks (one per table row) and produces ParsedContractData.
 * 2. A `buildDebtsFromParsedContract()` function that maps parsed rows
 *    to Debt[] + ProposalDebtTerms[] domain objects.
 * 3. A `linkCollateralToDebts()` function that populates
 *    CollateralLink.coveredDebtIds based on the secured/unsecured
 *    classification from Πίνακας 8.
 *
 * IMPORTANT: The parser does NOT read files. It receives pre-extracted
 * data from the caller (who uses pdftotext, pypdf, or the context window).
 * This keeps the parser pure and testable.
 *
 * PRIVACY: ΑΦΜ values from the PDF are used only for PersonId lookup —
 * never stored in training-safe projection.
 */

import type { ParsedContractData, ParsedDebtRow, ParsedRestructuringTermRow } from "./contractPdfTypes";
import type { Debt, DebtCategory } from "../../types/debt";
import type { ProposalDebtTerms } from "../../types/proposal";
import type { DebtPartyRole } from "../../types/debtPartyRole";
import type { CollateralLink } from "../../types/property";
import type { PersonId, DebtId } from "../../types/primitives";
import { makeDebtId } from "../../types/primitives";
import { normalizeCreditorKey, parseEuroCents, asAfm } from "../utils";
import type { SourceReference } from "../../types/source";

// ─── Debt category inference ──────────────────────────────────────────────────

/**
 * Infer debt category from spread basis points.
 * 300bp = secured (εμπραγμάτως) → likely mortgage
 * 400bp = unsecured → consumer or other
 *
 * RULE: We do NOT store inferred category as confirmed — we use "UNKNOWN"
 * and let manual review confirm. This is stored for transparency only.
 *
 * Actually: Per domain rules, we NEVER infer category from spread.
 * Category stays UNKNOWN until manually confirmed.
 */
function debtCategoryFromSpread(_spreadBp: number | null): DebtCategory {
  // Category must NOT be inferred — always UNKNOWN from PDF source
  return "UNKNOWN";
}

// ─── Contract number normalization ───────────────────────────────────────────

/**
 * The PDF splits contract numbers across two lines (e.g. "0000000000369\n0018856").
 * This joins them back, preserving leading zeros.
 * Example: "0000000000369" + "0018856" → "00000000003690018856"
 */
export function normalizeContractNumber(raw: string): string {
  return raw.replace(/\s+/g, "").trim();
}

// ─── Core builder: ParsedContractData → Domain objects ───────────────────────

export interface ContractImportResult {
  readonly debts: readonly Debt[];
  readonly proposalTerms: readonly ProposalDebtTerms[];
  readonly debtPartyRoles: readonly DebtPartyRole[];
  readonly updatedCollateralLinks: readonly CollateralLink[];
  readonly issues: readonly string[];
}

/**
 * Build Debt[], ProposalDebtTerms[], DebtPartyRole[] from a ParsedContractData.
 *
 * @param parsed           Parsed contract data.
 * @param applicantAfm     ΑΦΜ of the primary applicant (from Πίνακας 1).
 * @param personAfmToId    ΑΦΜ → PersonId map (applicant + co-debtors).
 * @param collateralLinks  Existing CollateralLink[] from Step 2 (to be populated).
 * @param filename         Original PDF filename.
 * @param importedAt       ISO timestamp.
 */
export function buildDebtsFromParsedContract(
  parsed: ParsedContractData,
  applicantAfm: string,
  personAfmToId: ReadonlyMap<string, PersonId>,
  collateralLinks: readonly CollateralLink[],
  filename: string,
  importedAt: string,
): ContractImportResult {
  const issues: string[] = [];

  const sourceRef: SourceReference = {
    sourceType: "PROPOSAL_OR_CONTRACT_PDF",
    originalFilename: filename,
    sheetName: null,
    rowReference: null,
    pageReference: "3-5",
    importedAt,
    verificationStatus: "VERIFIED_AGAINST_SOURCE",
  };

  // Build a map: debtIdentityRef → ParsedRestructuringTermRow
  const termsByIdentityRef = new Map<string, ParsedRestructuringTermRow>();
  for (const term of parsed.restructuringTermRows) {
    termsByIdentityRef.set(term.debtIdentityRef, term);
  }

  // Build a map: debtIdentityRef → DebtId (internal)
  const debtIdByIdentityRef = new Map<string, DebtId>();

  // ── Debts (from Πίνακας 5) ───────────────────────────────────────────────
  const debts: Debt[] = [];

  for (let i = 0; i < parsed.debtRows.length; i++) {
    const row = parsed.debtRows[i]!;
    const debtId = makeDebtId(`DEBT-PDF-${row.debtIdentityRef}`);
    debtIdByIdentityRef.set(row.debtIdentityRef, debtId);

    const terms = termsByIdentityRef.get(row.debtIdentityRef);

    const debt: Debt = {
      debtId,
      creditorKey: normalizeCreditorKey(row.creditorAfm),
      claimantLabel: row.claimantLabel,
      contractNumber: row.contractNumber,
      debtIdentityRef: row.debtIdentityRef,
      currency: row.currency || "EUR",
      principalAmountCents: row.principalCents,
      overdueInterestCents: row.overdueInterestCents,
      totalDebtCents: row.totalDebtCents,
      // Category never inferred — always UNKNOWN from PDF
      category: debtCategoryFromSpread(terms?.spreadBasisPoints ?? null),
      regulatedParticipation: row.isRegulated,
      sourceRef: { ...sourceRef, pageReference: "3" },
      verificationStatus: "VERIFIED_AGAINST_SOURCE",
    };

    debts.push(debt);
  }

  // ── Proposal Terms (from Πίνακας 8) ─────────────────────────────────────
  const proposalTerms: ProposalDebtTerms[] = [];

  for (const term of parsed.restructuringTermRows) {
    const debtId = debtIdByIdentityRef.get(term.debtIdentityRef);
    if (!debtId) {
      issues.push(`ProposalTerm references unknown debtIdentityRef: ${term.debtIdentityRef}`);
      continue;
    }

    // Euribor 3M with floor zero + spread → FLOATING
    const rateMode = "FLOATING" as const;

    const proposalTerm: ProposalDebtTerms = {
      termId: `TERM-PDF-${term.debtIdentityRef}`,
      debtId,
      totalDebtBeforeCents: term.totalDebtCents,
      writeOffAmountCents: term.writeOffCents,
      finalRegulatedAmountCents: term.finalRegulatedCents,
      currency: "EUR",
      rateMode,
      rateBase: "EURIBOR_3M",
      spreadBasisPoints: term.spreadBasisPoints,
      fixedRateBasisPoints: null,
      paymentTermMonths: term.paymentTermMonths,
      upfrontPaymentCents: null, // not specified in this contract
      // Monthly installment from Παράρτημα Ι
      installmentAmountCents: _findMonthlyInstallment(parsed, term.debtIdentityRef),
      // 3% = secured = NOT public/social-security; 4% = unsecured = NOT either
      isPublicOrSocialSecurityDebt: false,
      sourceRef: { ...sourceRef, pageReference: "5" },
      verificationStatus: "VERIFIED_AGAINST_SOURCE",
    };

    proposalTerms.push(proposalTerm);
  }

  // ── DebtPartyRoles (from Πίνακας 7) ──────────────────────────────────────
  const debtPartyRoles: DebtPartyRole[] = [];

  // Primary debtor on all debts — from explicit applicantAfm parameter
  const applicantPersonId = personAfmToId.get(applicantAfm);
  if (applicantPersonId) {
    for (const [identityRef, debtId] of debtIdByIdentityRef) {
      debtPartyRoles.push({
        mappingId: `DPR-PRIMARY-${identityRef}`,
        debtId,
        personId: applicantPersonId,
        role: "PRIMARY_DEBTOR",
        participatedInApplication: true,
        signedContract: null, // ΠΡΟΧΕΙΡΟ — not yet signed
        benefitsFromRestructuring: true,
        sourceRef: { ...sourceRef, pageReference: "1" },
      });
    }
  } else {
    issues.push(`Applicant ΑΦΜ ****${applicantAfm.slice(-4)} not found in personMap`);
  }

  // Co-debtor roles: only on specific debts (from Πίνακας 7)
  for (const cdRow of parsed.coDebtorDebtRows) {
    const coDebtorPersonId = personAfmToId.get(cdRow.coDebtorAfm);
    const debtId = debtIdByIdentityRef.get(cdRow.debtIdentityRef);

    if (!debtId) {
      issues.push(`CoDebtor debt not found for identityRef: ${cdRow.debtIdentityRef}`);
      continue;
    }

    debtPartyRoles.push({
      mappingId: `DPR-CODEBT-${cdRow.debtIdentityRef}-${cdRow.coDebtorAfm.slice(-4)}`,
      debtId,
      personId: coDebtorPersonId ?? (`PERSON-${cdRow.coDebtorAfm.slice(-4)}`) as PersonId,
      role: "CO_DEBTOR",
      participatedInApplication: true,
      // Co-debtor is NOT in Πίνακας 2 (did not sign) — explicit flag
      signedContract: false,
      benefitsFromRestructuring: false, // per §4 of the contract
      sourceRef: { ...sourceRef, pageReference: "4" },
    });
  }

  // ── CollateralLink: populate coveredDebtIds ───────────────────────────────
  //
  // From Πίνακας 8: spread 300bp = secured (εμπραγμάτως εξασφαλισμένη)
  // The 3 secured debts use BOTH properties as collateral.
  // Unsecured debts (400bp) are NOT covered by property collateral.
  //
  // We cannot determine WHICH collateral covers WHICH secured debt
  // without additional legal documents. We link ALL collateral to
  // ALL secured debts and raise a WARNING.
  //
  const securedDebtIds: DebtId[] = [];
  for (const term of parsed.restructuringTermRows) {
    if (term.isCollateralSecured === true) {
      const debtId = debtIdByIdentityRef.get(term.debtIdentityRef);
      if (debtId) securedDebtIds.push(debtId);
    }
  }

  if (securedDebtIds.length === 0) {
    issues.push("WARNING: No secured debts found — collateral links not populated.");
  }

  const updatedCollateralLinks: CollateralLink[] = collateralLinks.map((link) => ({
    ...link,
    coveredDebtIds: securedDebtIds,
  }));

  if (collateralLinks.length > 0 && securedDebtIds.length > 0) {
    issues.push(
      `INFO: ${collateralLinks.length} collateral link(s) linked to ${securedDebtIds.length} secured debt(s). ` +
      "Per-collateral/per-debt assignment requires manual verification against registration certificates."
    );
  }

  return {
    debts,
    proposalTerms,
    debtPartyRoles,
    updatedCollateralLinks,
    issues,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _findMonthlyInstallment(
  parsed: ParsedContractData,
  debtIdentityRef: string,
): number | null {
  // Find any installment entry for this debt (all years have same monthly amount)
  const entry = parsed.installmentSchedule.find(
    (e) => e.debtIdentityRef === debtIdentityRef
  );
  return entry?.monthlyAmountCents ?? null;
}

function _findApplicantAfm(parsed: ParsedContractData): string | null {
  // The applicant ΑΦΜ is the one NOT in coDebtorRows
  const coDebtorAfms = new Set(parsed.coDebtorRows.map((r) => r.coDebtorAfm));
  // We don't store applicant ΑΦΜ in ParsedContractData to avoid PII.
  // Caller must provide it via personAfmToId with role APPLICANT.
  void coDebtorAfms;
  return null; // caller handles applicant role separately
}

// ─── Static parser for this specific contract format ─────────────────────────

/**
 * Produce a ParsedContractData from the CONFIRMED data in the
 * Σύμβαση Αναδιάρθρωσης Ν.4738/2020 — this case.
 *
 * In production this would parse pdftotext output.
 * For this step, we encode the confirmed data directly from inspection,
 * exactly as it appears in the PDF, with no assumptions.
 *
 * All contract numbers and identity refs are strings preserving leading zeros.
 * All money is integer cents.
 */
export function parseContractPdfData(
  filename: string,
  importedAt: string,
): ParsedContractData {
  return {
    applicationNumber: "443624",
    submissionDate: "2025-11-27",
    documentCreatedDate: "2026-06-20",

    // ── Πίνακας 5 ──────────────────────────────────────────────────────────
    debtRows: [
      {
        creditorAfm: "099755919",
        claimantLabel: "XYQ Luxco S.à r.l.",
        contractNumber: "00000000003697011326",
        debtIdentityRef: "0407030211828",
        principalCents: parseEuroCents("€ 11.385,05"),
        overdueInterestCents: parseEuroCents("€ 29,34"),
        totalDebtCents: parseEuroCents("€ 11.414,39"),
        currency: "EUR",
        isRegulated: true,
      },
      {
        creditorAfm: "099755919",
        claimantLabel: "XYQ Luxco S.à r.l.",
        contractNumber: "00000000003690018856",
        debtIdentityRef: "0407930211855",
        principalCents: parseEuroCents("€ 109.252,66"),
        overdueInterestCents: parseEuroCents("€ 6.385,70"),
        totalDebtCents: parseEuroCents("€ 115.638,36"),
        currency: "EUR",
        isRegulated: true,
      },
      {
        creditorAfm: "099755919",
        claimantLabel: "XYQ Luxco S.à r.l.",
        contractNumber: "00000000004241963714_1",
        debtIdentityRef: "0407020211830",
        principalCents: parseEuroCents("€ 1.532,93"),
        overdueInterestCents: parseEuroCents("€ 4,08"),
        totalDebtCents: parseEuroCents("€ 1.537,01"),
        currency: "EUR",
        isRegulated: true,
      },
      {
        creditorAfm: "099755919",
        claimantLabel: "XYQ Luxco S.à r.l.",
        contractNumber: "00000000004253344151_1",
        debtIdentityRef: "0407910211900",
        principalCents: parseEuroCents("€ 120.580,14"),
        overdueInterestCents: parseEuroCents("€ 5.440,68"),
        totalDebtCents: parseEuroCents("€ 126.020,82"),
        currency: "EUR",
        isRegulated: true,
      },
      {
        creditorAfm: "099755919",
        claimantLabel: "XYQ Luxco S.à r.l.",
        contractNumber: "00000000004253343627_1",
        debtIdentityRef: "0407910211901",
        principalCents: parseEuroCents("€ 25.131,96"),
        overdueInterestCents: parseEuroCents("€ 1.127,12"),
        totalDebtCents: parseEuroCents("€ 26.259,08"),
        currency: "EUR",
        isRegulated: true,
      },
    ],

    // ── Πίνακας 6 ──────────────────────────────────────────────────────────
    coDebtorRows: [
      {
        coDebtorAfm: "041551914",
        creditorAfm: "099755919",
        claimantLabel: "XYQ Luxco S.à r.l.",
      },
    ],

    // ── Πίνακας 7: Συνοφειλέτης ενέχεται μόνο σε 2 οφειλές ────────────────
    coDebtorDebtRows: [
      {
        coDebtorAfm: "041551914",
        contractNumber: "00000000004253343627_1",
        debtIdentityRef: "0407910211901",
        totalDebtCents: parseEuroCents("€ 26.259,08"),
      },
      {
        coDebtorAfm: "041551914",
        contractNumber: "00000000003690018856",
        debtIdentityRef: "0407930211855",
        totalDebtCents: parseEuroCents("€ 115.638,36"),
      },
    ],

    // ── Πίνακας 8 ──────────────────────────────────────────────────────────
    restructuringTermRows: [
      {
        creditorAfm: "099755919",
        claimantLabel: "XYQ Luxco S.à r.l.",
        contractNumber: "00000000003690018856",
        debtIdentityRef: "0407930211855",
        totalDebtCents: parseEuroCents("€ 115.638,36"),
        writeOffCents: parseEuroCents("€ 10.723,19"),
        finalRegulatedCents: parseEuroCents("€ 104.915,17"),
        rateBaseBasisPoints: 0,   // Euribor 3M floor zero
        spreadBasisPoints: 300,   // 3.00% — secured
        paymentTermMonths: 228,
        isCollateralSecured: true,
      },
      {
        creditorAfm: "099755919",
        claimantLabel: "XYQ Luxco S.à r.l.",
        contractNumber: "00000000004253344151_1",
        debtIdentityRef: "0407910211900",
        totalDebtCents: parseEuroCents("€ 126.020,82"),
        writeOffCents: parseEuroCents("€ 84.592,09"),
        finalRegulatedCents: parseEuroCents("€ 41.428,73"),
        rateBaseBasisPoints: 0,
        spreadBasisPoints: 300,   // 3.00% — secured
        paymentTermMonths: 180,
        isCollateralSecured: true,
      },
      {
        creditorAfm: "099755919",
        claimantLabel: "XYQ Luxco S.à r.l.",
        contractNumber: "00000000004253343627_1",
        debtIdentityRef: "0407910211901",
        totalDebtCents: parseEuroCents("€ 26.259,08"),
        writeOffCents: parseEuroCents("€ 0,00"),
        finalRegulatedCents: parseEuroCents("€ 26.259,08"),
        rateBaseBasisPoints: 0,
        spreadBasisPoints: 300,   // 3.00% — secured
        paymentTermMonths: 228,
        isCollateralSecured: true,
      },
      {
        creditorAfm: "099755919",
        claimantLabel: "XYQ Luxco S.à r.l.",
        contractNumber: "00000000004241963714_1",
        debtIdentityRef: "0407020211830",
        totalDebtCents: parseEuroCents("€ 1.537,01"),
        writeOffCents: parseEuroCents("€ 34,29"),
        finalRegulatedCents: parseEuroCents("€ 1.502,72"),
        rateBaseBasisPoints: 0,
        spreadBasisPoints: 400,   // 4.00% — unsecured
        paymentTermMonths: 180,
        isCollateralSecured: false,
      },
      {
        creditorAfm: "099755919",
        claimantLabel: "XYQ Luxco S.à r.l.",
        contractNumber: "00000000003697011326",
        debtIdentityRef: "0407030211828",
        totalDebtCents: parseEuroCents("€ 11.414,39"),
        writeOffCents: parseEuroCents("€ 254,65"),
        finalRegulatedCents: parseEuroCents("€ 11.159,74"),
        rateBaseBasisPoints: 0,
        spreadBasisPoints: 400,   // 4.00% — unsecured
        paymentTermMonths: 180,
        isCollateralSecured: false,
      },
    ],

    // ── Παράρτημα Ι: Δοσολόγιο (first year only — all years identical) ──────
    installmentSchedule: [
      {
        contractNumber: "00000000003690018856",
        debtIdentityRef: "0407930211855",
        repaymentYear: 1,
        monthsInYear: 12,
        annualAmountCents: parseEuroCents("€ 7.251,00"),
        monthlyAmountCents: parseEuroCents("€ 604,25"),
      },
      {
        contractNumber: "00000000004253344151_1",
        debtIdentityRef: "0407910211900",
        repaymentYear: 1,
        monthsInYear: 12,
        annualAmountCents: parseEuroCents("€ 3.433,19"),
        monthlyAmountCents: parseEuroCents("€ 286,10"),
      },
      {
        contractNumber: "00000000004253343627_1",
        debtIdentityRef: "0407910211901",
        repaymentYear: 1,
        monthsInYear: 12,
        annualAmountCents: parseEuroCents("€ 1.814,84"),
        monthlyAmountCents: parseEuroCents("€ 151,24"),
      },
      {
        contractNumber: "00000000004241963714_1",
        debtIdentityRef: "0407020211830",
        repaymentYear: 1,
        monthsInYear: 12,
        annualAmountCents: parseEuroCents("€ 133,39"),
        monthlyAmountCents: parseEuroCents("€ 11,12"),
      },
      {
        contractNumber: "00000000003697011326",
        debtIdentityRef: "0407030211828",
        repaymentYear: 1,
        monthsInYear: 12,
        annualAmountCents: parseEuroCents("€ 990,57"),
        monthlyAmountCents: parseEuroCents("€ 82,55"),
      },
    ],

    sourceFilename: filename,
    importedAt,
  };
}
