/**
 * ExoPredict PRO — Anonymized / Synthetic Test Fixtures
 * Step 1: Domain Foundation
 *
 * ALL data here is synthetic. No real names, AFMs, addresses,
 * contract numbers, IBANs, or personal identifiers are used.
 */

import type { ExtrajudicialCase } from "../types/case";
import type { SourceReference } from "../types/source";
import {
  makeCaseId,
  makePersonId,
  makeDebtId,
  makePropertyId,
  makeCollateralId,
  makeOwnershipId,
} from "../types/primitives";

// ─── Shared source references ─────────────────────────────────────────────────

export const syntheticSourceRef: SourceReference = {
  sourceType: "DEBTS_SUMMARY_EXPORT",
  originalFilename: "ANONYMIZED_DEBTS_EXPORT.xls",
  sheetName: "Sheet1",
  rowReference: "5",
  pageReference: null,
  importedAt: "2024-01-15T10:00:00Z",
  verificationStatus: "VERIFIED_AGAINST_SOURCE",
};

export const manualEntryRef: SourceReference = {
  sourceType: "MANUAL_ENTRY",
  originalFilename: null,
  sheetName: null,
  rowReference: null,
  pageReference: null,
  importedAt: "2024-01-16T09:30:00Z",
  verificationStatus: "UNVERIFIED",
};

export const pdfRef: SourceReference = {
  sourceType: "PROPOSAL_OR_CONTRACT_PDF",
  originalFilename: "ANONYMIZED_CONTRACT.pdf",
  sheetName: null,
  rowReference: null,
  pageReference: "3",
  importedAt: "2024-02-01T14:00:00Z",
  verificationStatus: "VERIFIED_AGAINST_SOURCE",
};

// ─── IDs ──────────────────────────────────────────────────────────────────────

export const CASE_A = makeCaseId("CASE-SYNTH-001");
export const PERSON_APPLICANT = makePersonId("P-001");
export const PERSON_SPOUSE = makePersonId("P-002");
export const PERSON_CO_DEBTOR = makePersonId("P-003");
export const PERSON_GUARANTOR = makePersonId("P-004");
export const PERSON_THIRD_COLLATERAL = makePersonId("P-005");

export const DEBT_ALPHA = makeDebtId("D-001");
export const DEBT_BETA = makeDebtId("D-002");
export const DEBT_GAMMA = makeDebtId("D-003");

export const PROPERTY_MAIN = makePropertyId("PROP-001");
export const COLLATERAL_MAIN = makeCollateralId("COL-001");
export const OWNERSHIP_MAIN_APPLICANT = makeOwnershipId("OWN-001");
export const OWNERSHIP_MAIN_SPOUSE = makeOwnershipId("OWN-002");

// ─── Fixture: minimal valid case ──────────────────────────────────────────────

/**
 * A synthetic case with:
 * - 3 debts (two with leading-zero contract numbers)
 * - 1 property covered by all 3 debts
 * - Co-debtor linked only to DEBT_ALPHA
 * - Guarantor linked only to DEBT_BETA
 * - Third-party collateral provider for DEBT_GAMMA
 * - No real PII
 */
export const syntheticCaseA: ExtrajudicialCase = {
  caseId: CASE_A,
  status: "CONTRACT_SIGNED",
  submissionDate: "2023-06-01",
  proposalOrContractDate: "2024-01-10",
  sourceFileManifest: {
    files: [
      {
        label: "Debts summary export",
        anonymizedRef: "DEBTS-EXPORT-SYNTH-001",
        sourceType: "DEBTS_SUMMARY_EXPORT",
        importedAt: "2024-01-15T10:00:00Z",
      },
      {
        label: "Contract PDF",
        anonymizedRef: "CONTRACT-SYNTH-001",
        sourceType: "PROPOSAL_OR_CONTRACT_PDF",
        importedAt: "2024-02-01T14:00:00Z",
      },
    ],
  },

  persons: [
    {
      personId: PERSON_APPLICANT,
      role: "APPLICANT",
      privateIdentity: null, // PII intentionally absent in fixtures
      sourceRef: syntheticSourceRef,
    },
    {
      personId: PERSON_SPOUSE,
      role: "SPOUSE_OR_PARTNER",
      privateIdentity: null,
      sourceRef: syntheticSourceRef,
    },
    {
      personId: PERSON_CO_DEBTOR,
      role: "CO_DEBTOR",
      privateIdentity: null,
      sourceRef: syntheticSourceRef,
    },
    {
      personId: PERSON_GUARANTOR,
      role: "GUARANTOR",
      privateIdentity: null,
      sourceRef: syntheticSourceRef,
    },
    {
      personId: PERSON_THIRD_COLLATERAL,
      role: "THIRD_PARTY_COLLATERAL_PROVIDER",
      privateIdentity: null,
      sourceRef: syntheticSourceRef,
    },
  ],

  household: {
    householdSize: 4,
    dependentChildrenCount: 2,
    minorChildrenCount: 1,
    spouseOrPartnerPresent: true,
    participatingCoDebtorCount: 1,
    nonParticipatingCoDebtorCount: 0,
  },

  incomes: [
    {
      recordId: "INC-001",
      personId: PERSON_APPLICANT,
      category: "EMPLOYMENT_SALARY",
      periodicity: "MONTHLY",
      netAmountCents: 120000, // €1,200.00
      grossAmountCents: 150000,
      taxYear: 2023,
      asOfDate: "2023-12-31",
      sourceRef: { ...syntheticSourceRef, sourceType: "INCOME_EXPORT" },
      verificationStatus: "VERIFIED_AGAINST_SOURCE",
    },
    {
      recordId: "INC-002",
      personId: PERSON_SPOUSE,
      category: "PENSION",
      periodicity: "MONTHLY",
      netAmountCents: null, // unknown — must not be treated as 0
      grossAmountCents: null,
      taxYear: 2023,
      asOfDate: null,
      sourceRef: manualEntryRef,
      verificationStatus: "UNVERIFIED",
    },
  ],

  financialAssets: [
    {
      assetId: "FIN-001",
      personIds: [PERSON_APPLICANT, PERSON_SPOUSE],
      assetType: "BANK_DEPOSIT",
      balanceCents: 500000, // €5,000.00
      currency: "EUR",
      asOfDate: "2023-12-31",
      institutionKey: "ALPHA_BANK_GR",
      sourceRef: { ...syntheticSourceRef, sourceType: "FINANCIAL_ASSET_EXPORT" },
      verificationStatus: "VERIFIED_AGAINST_SOURCE",
    },
  ],

  debts: [
    {
      debtId: DEBT_ALPHA,
      creditorKey: "SERVICER_A_GR",
      claimantLabel: "Servicer A",
      contractNumber: "00123456789", // leading zeros — must stay as string
      debtIdentityRef: "007654321",
      currency: "EUR",
      principalAmountCents: 8500000,  // €85,000.00
      overdueInterestCents: 350000,   // €3,500.00
      totalDebtCents: 8850000,        // €88,500.00
      category: "MORTGAGE",
      regulatedParticipation: true,
      sourceRef: syntheticSourceRef,
      verificationStatus: "VERIFIED_AGAINST_SOURCE",
    },
    {
      debtId: DEBT_BETA,
      creditorKey: "BANK_B_GR",
      claimantLabel: "Bank B",
      contractNumber: "00987654321",
      debtIdentityRef: null,
      currency: "EUR",
      principalAmountCents: null, // source does not distinguish principal
      overdueInterestCents: null,
      totalDebtCents: 2200000,    // €22,000.00
      category: "CONSUMER",
      regulatedParticipation: true,
      sourceRef: syntheticSourceRef,
      verificationStatus: "VERIFIED_AGAINST_SOURCE",
    },
    {
      debtId: DEBT_GAMMA,
      creditorKey: "SERVICER_C_GR",
      claimantLabel: null,
      contractNumber: "00111222333",
      debtIdentityRef: null,
      currency: "EUR",
      principalAmountCents: null,
      overdueInterestCents: null,
      totalDebtCents: 0, // explicitly zero (settled before inclusion)
      category: "UNKNOWN",
      regulatedParticipation: false,
      sourceRef: syntheticSourceRef,
      verificationStatus: "UNVERIFIED",
    },
  ],

  // Co-debtor linked ONLY to DEBT_ALPHA — not all debts
  debtPartyRoles: [
    {
      mappingId: "DPR-001",
      debtId: DEBT_ALPHA,
      personId: PERSON_APPLICANT,
      role: "PRIMARY_DEBTOR",
      participatedInApplication: true,
      signedContract: true,
      benefitsFromRestructuring: true,
      sourceRef: syntheticSourceRef,
    },
    {
      mappingId: "DPR-002",
      debtId: DEBT_ALPHA,
      personId: PERSON_CO_DEBTOR,
      role: "CO_DEBTOR",            // only on DEBT_ALPHA
      participatedInApplication: true,
      signedContract: false,
      benefitsFromRestructuring: null,
      sourceRef: syntheticSourceRef,
    },
    {
      mappingId: "DPR-003",
      debtId: DEBT_BETA,
      personId: PERSON_GUARANTOR,
      role: "GUARANTOR",            // only on DEBT_BETA
      participatedInApplication: false,
      signedContract: false,
      benefitsFromRestructuring: false,
      sourceRef: syntheticSourceRef,
    },
    {
      mappingId: "DPR-004",
      debtId: DEBT_GAMMA,
      personId: PERSON_THIRD_COLLATERAL,
      role: "THIRD_PARTY_COLLATERAL_PROVIDER", // only on DEBT_GAMMA
      participatedInApplication: false,
      signedContract: false,
      benefitsFromRestructuring: null,
      sourceRef: syntheticSourceRef,
    },
  ],

  properties: [
    {
      propertyId: PROPERTY_MAIN,
      propertyType: "PRIMARY_RESIDENCE",
      kaek: "123456789012", // synthetic KAEK
      areaLabel: "Κεντρική Αττική", // non-identifying area label
      sourceRef: { ...syntheticSourceRef, sourceType: "ASSET_EXPORT" },
      verificationStatus: "VERIFIED_AGAINST_SOURCE",
    },
  ],

  propertyOwnerships: [
    {
      ownershipId: OWNERSHIP_MAIN_APPLICANT,
      propertyId: PROPERTY_MAIN,
      personId: PERSON_APPLICANT,
      ownershipPercentage: 50,
      sourceRef: { ...syntheticSourceRef, sourceType: "ASSET_EXPORT" },
    },
    {
      ownershipId: OWNERSHIP_MAIN_SPOUSE,
      propertyId: PROPERTY_MAIN,
      personId: PERSON_SPOUSE,
      ownershipPercentage: 50,
      sourceRef: { ...syntheticSourceRef, sourceType: "ASSET_EXPORT" },
    },
  ],

  propertyValueEvidences: [
    {
      propertyId: PROPERTY_MAIN,
      valueType: "OBJECTIVE_VALUE",
      amountCents: 6000000, // €60,000.00
      range: null,
      currency: "EUR",
      asOfDate: "2023-01-01",
      methodDescription: "AADE αντικειμενική αξία",
      confidence: "HIGH",
      sourceRef: { ...syntheticSourceRef, sourceType: "ASSET_EXPORT" },
      verificationStatus: "VERIFIED_AGAINST_SOURCE",
    },
    {
      propertyId: PROPERTY_MAIN,
      valueType: "CREDITOR_COLLATERAL_VALUE",
      amountCents: 9000000, // €90,000.00 — creditor's own valuation
      range: null,
      currency: "EUR",
      asOfDate: "2022-06-15",
      methodDescription: "Εκτίμηση πιστωτή",
      confidence: "MEDIUM",
      sourceRef: { ...syntheticSourceRef, sourceType: "COLLATERAL_EXPORT" },
      verificationStatus: "VERIFIED_AGAINST_SOURCE",
    },
    // No MARKET_VALUE_ESTIMATE — should trigger V03 warning
  ],

  // Same property covers all 3 debts — must NOT be double-counted
  collateralLinks: [
    {
      collateralId: COLLATERAL_MAIN,
      propertyId: PROPERTY_MAIN,
      coveredDebtIds: [DEBT_ALPHA, DEBT_BETA, DEBT_GAMMA],
      registrationPriority: 1,
      sourceRef: { ...syntheticSourceRef, sourceType: "COLLATERAL_EXPORT" },
      verificationStatus: "VERIFIED_AGAINST_SOURCE",
    },
  ],

  proposalTerms: [
    {
      termId: "PT-001",
      debtId: DEBT_ALPHA,
      totalDebtBeforeCents: 8850000,
      writeOffAmountCents: 1350000, // €13,500.00 written off
      finalRegulatedAmountCents: 7500000,
      currency: "EUR",
      rateMode: "FLOATING",
      rateBase: "EURIBOR_3M",
      spreadBasisPoints: 150,
      fixedRateBasisPoints: null,
      paymentTermMonths: 240,
      upfrontPaymentCents: null,
      installmentAmountCents: null,
      isPublicOrSocialSecurityDebt: false,
      sourceRef: pdfRef,
      verificationStatus: "VERIFIED_AGAINST_SOURCE",
    },
    {
      termId: "PT-002",
      debtId: DEBT_BETA,
      totalDebtBeforeCents: 2200000,
      writeOffAmountCents: 700000,
      finalRegulatedAmountCents: 1500000,
      currency: "EUR",
      rateMode: "FIXED",
      rateBase: null,
      spreadBasisPoints: null,
      fixedRateBasisPoints: 250,
      paymentTermMonths: 120,
      upfrontPaymentCents: 0,
      installmentAmountCents: null,
      isPublicOrSocialSecurityDebt: false,
      sourceRef: pdfRef,
      verificationStatus: "VERIFIED_AGAINST_SOURCE",
    },
    // DEBT_GAMMA has no proposal terms — out of regulation scope
  ],

  outcome: {
    status: "SIGNED",
    proposalIssuedDate: "2023-12-15",
    signedDate: "2024-01-10",
    recordedAt: "2024-01-10T16:00:00Z",
    notes: null,
  },

  // SIGNED does NOT auto-become ELIGIBLE_VERIFIED
  trainingEligibility: {
    status: "NOT_REVIEWED",
    exclusionReason: null,
    reviewedAt: null,
    reviewedBy: null,
  },

  dataQualityFlags: [],
};
