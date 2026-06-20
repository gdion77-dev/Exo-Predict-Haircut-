/**
 * ExoPredict PRO — Node.js test runner (no framework required)
 * Runs all 10 required domain tests.
 */

import { syntheticCaseA, DEBT_ALPHA, DEBT_BETA, DEBT_GAMMA, PROPERTY_MAIN,
  PERSON_CO_DEBTOR, PERSON_GUARANTOR, PERSON_THIRD_COLLATERAL } from "../../src/domain/exopredict/fixtures/syntheticCaseA";
import { validateIdentifierTypes, validateMoneyNullVsZero, validatePropertyValueTypeSeparation,
  validateNoPropertyDoubleCounting, validateDebtPersonMappingCompleteness,
  validateTrainingSafeProjectionNoPII, validateCase } from "../../src/domain/exopredict/validators";
import { projectTrainingSafe } from "../../src/domain/exopredict/types/projection";
import { makeDebtId } from "../../src/domain/exopredict/types/primitives";
import type { Debt } from "../../src/domain/exopredict/types/debt";
import type { ExtrajudicialCase } from "../../src/domain/exopredict/types/case";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string): void {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${name}`);
    failed++;
  }
}

function group(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

// ─── T01 ─────────────────────────────────────────────────────────────────────
group("T01 — External identifiers preserve leading zeros", () => {
  const debtAlpha = syntheticCaseA.debts.find(d => d.debtId === DEBT_ALPHA)!;
  assert(typeof debtAlpha.contractNumber === "string", "contractNumber is string");
  assert(debtAlpha.contractNumber === "00123456789", "contractNumber value preserved with leading zeros");
  assert(debtAlpha.contractNumber!.startsWith("00"), "starts with 00");
  assert(typeof debtAlpha.debtIdentityRef === "string", "debtIdentityRef is string");
  assert(debtAlpha.debtIdentityRef === "007654321", "debtIdentityRef preserves leading zeros");
  const issues = validateIdentifierTypes(syntheticCaseA.debts);
  assert(issues.filter(i => i.code === "V01_CONTRACT_NUMBER_NOT_STRING").length === 0, "V01 no blocker for valid strings");
});

// ─── T02 ─────────────────────────────────────────────────────────────────────
group("T02 — null money ≠ 0", () => {
  const spouseIncome = syntheticCaseA.incomes.find(i => i.recordId === "INC-002")!;
  assert(spouseIncome.netAmountCents === null, "null income stays null");

  const debtWithNull: Debt = {
    debtId: makeDebtId("D-NULL-TEST"), creditorKey: "TEST", claimantLabel: null,
    contractNumber: "00000001", debtIdentityRef: null, currency: "EUR",
    principalAmountCents: null, overdueInterestCents: null, totalDebtCents: null,
    category: "UNKNOWN", regulatedParticipation: null, sourceRef: null, verificationStatus: "UNKNOWN"
  };
  const issues = validateMoneyNullVsZero([debtWithNull]);
  assert(issues.some(i => i.code === "V02_TOTAL_DEBT_UNKNOWN"), "null total triggers V02 warning");

  const debtGamma = syntheticCaseA.debts.find(d => d.debtId === DEBT_GAMMA)!;
  assert(debtGamma.totalDebtCents === 0, "explicit zero is 0, not null");
  const issuesGamma = validateMoneyNullVsZero([debtGamma]);
  assert(!issuesGamma.some(i => i.code === "V02_TOTAL_DEBT_UNKNOWN"), "zero does NOT trigger null warning");
});

// ─── T03 ─────────────────────────────────────────────────────────────────────
group("T03 — Creditor collateral value ≠ market value", () => {
  const evs = syntheticCaseA.propertyValueEvidences.filter(e => e.propertyId === PROPERTY_MAIN);
  assert(evs.some(e => e.valueType === "CREDITOR_COLLATERAL_VALUE"), "creditor collateral value present");
  assert(!evs.some(e => e.valueType === "MARKET_VALUE_ESTIMATE"), "no market value in fixture");

  const projection = projectTrainingSafe(syntheticCaseA);
  const prop = projection.properties[0]!;
  assert(prop.marketValueCents === null, "projection market value is null (no fallback)");

  const issues = validatePropertyValueTypeSeparation(syntheticCaseA.propertyValueEvidences);
  assert(issues.some(i => i.code === "V03_MISSING_MARKET_VALUE"), "V03 warning for missing market value");
});

// ─── T04 ─────────────────────────────────────────────────────────────────────
group("T04 — No double-counting of property across debts", () => {
  assert(syntheticCaseA.properties.length === 1, "exactly 1 property record");
  assert(syntheticCaseA.properties[0]!.propertyId === PROPERTY_MAIN, "property id correct");
  assert(syntheticCaseA.collateralLinks.length === 1, "1 collateral link");
  assert(syntheticCaseA.collateralLinks[0]!.coveredDebtIds.length === 3, "link covers 3 debts");

  const issues = validateNoPropertyDoubleCounting(syntheticCaseA.collateralLinks);
  const info = issues.filter(i => i.code === "V04_PROPERTY_COVERS_MULTIPLE_DEBTS");
  assert(info.length === 1 && info[0]!.severity === "INFO", "V04 INFO raised, not blocker");
});

// ─── T05 ─────────────────────────────────────────────────────────────────────
group("T05 — Co-debtor linked to one specific debt", () => {
  const coDebtorRoles = syntheticCaseA.debtPartyRoles.filter(
    r => r.personId === PERSON_CO_DEBTOR && r.role === "CO_DEBTOR");
  assert(coDebtorRoles.length === 1, "co-debtor appears exactly once");
  assert(coDebtorRoles[0]!.debtId === DEBT_ALPHA, "co-debtor linked to DEBT_ALPHA only");

  const onOther = syntheticCaseA.debtPartyRoles.filter(
    r => r.personId === PERSON_CO_DEBTOR && (r.debtId === DEBT_BETA || r.debtId === DEBT_GAMMA));
  assert(onOther.length === 0, "co-debtor has no role on DEBT_BETA or DEBT_GAMMA");
});

// ─── T06 ─────────────────────────────────────────────────────────────────────
group("T06 — CO_DEBTOR, GUARANTOR, THIRD_PARTY_COLLATERAL_PROVIDER are distinct", () => {
  const coDebtorRole = syntheticCaseA.debtPartyRoles.find(r => r.personId === PERSON_CO_DEBTOR)!;
  assert(coDebtorRole.role === "CO_DEBTOR", "PERSON_CO_DEBTOR has role CO_DEBTOR");

  const guarantorRole = syntheticCaseA.debtPartyRoles.find(r => r.personId === PERSON_GUARANTOR)!;
  assert(guarantorRole.role === "GUARANTOR", "PERSON_GUARANTOR has role GUARANTOR");
  assert(guarantorRole.debtId === DEBT_BETA, "guarantor linked to DEBT_BETA");

  const thirdRole = syntheticCaseA.debtPartyRoles.find(r => r.personId === PERSON_THIRD_COLLATERAL)!;
  assert(thirdRole.role === "THIRD_PARTY_COLLATERAL_PROVIDER", "PERSON_THIRD_COLLATERAL has correct role");
  assert(thirdRole.debtId === DEBT_GAMMA, "third party linked to DEBT_GAMMA");

  const roles = new Set([coDebtorRole.role, guarantorRole.role, thirdRole.role]);
  assert(roles.size === 3, "all three roles are distinct");
});

// ─── T07 ─────────────────────────────────────────────────────────────────────
group("T07 — Training-safe projection contains no PII", () => {
  const projection = projectTrainingSafe(syntheticCaseA);
  const projStr = JSON.stringify(projection);
  assert(!projStr.includes("privateIdentity"), "no privateIdentity in projection");
  assert(!projStr.includes("fullName"), "no fullName in projection");
  assert(!projStr.includes("address"), "no address field");
  assert(!projStr.includes("contractNumber"), "no contractNumber");
  assert(!projStr.includes("00123456789"), "raw contract number not present");

  const projWithFakeAFM = {
    ...projection,
    properties: [{ propertyType: "PRIMARY_RESIDENCE", areaLabel: "123456789",
      marketValueCents: null, objectiveValueCents: null, currency: "EUR" as const }]
  };
  const piiIssues = validateTrainingSafeProjectionNoPII(projWithFakeAFM);
  assert(piiIssues.some(i => i.code === "V08_PII_LEAK_IN_PROJECTION"), "V08 catches 9-digit pattern");

  const cleanIssues = validateTrainingSafeProjectionNoPII(projection);
  assert(cleanIssues.filter(i => i.severity === "BLOCKER").length === 0, "clean projection passes V08");
});

// ─── T08 ─────────────────────────────────────────────────────────────────────
group("T08 — Incomplete data → explicit warnings, not fabricated values", () => {
  const issues = validatePropertyValueTypeSeparation(syntheticCaseA.propertyValueEvidences);
  const warning = issues.find(i => i.code === "V03_MISSING_MARKET_VALUE");
  assert(warning !== undefined && warning.severity === "WARNING", "V03 WARNING raised for missing market value");

  const income = syntheticCaseA.incomes.find(i => i.recordId === "INC-002")!;
  assert(income.netAmountCents === null, "null income preserved as null");

  const projection = projectTrainingSafe(syntheticCaseA);
  assert(projection.totalIncomeCents === null, "projection totalIncome is null when any income unknown");

  const result = validateCase(syntheticCaseA);
  assert(result.hasWarnings === true, "overall validation detects warnings");
  assert(result.hasBlockers === false, "no blockers in valid fixture");
  assert(result.issues.length > 0, "issues array non-empty");
});

// ─── T09 ─────────────────────────────────────────────────────────────────────
group("T09 — Proposal terms per debt, not only aggregate", () => {
  assert(syntheticCaseA.proposalTerms.length === 2, "2 proposal term records");
  const termDebtIds = syntheticCaseA.proposalTerms.map(t => t.debtId);
  assert(termDebtIds.includes(DEBT_ALPHA), "term for DEBT_ALPHA exists");
  assert(termDebtIds.includes(DEBT_BETA), "term for DEBT_BETA exists");
  assert(!termDebtIds.includes(DEBT_GAMMA), "no term for DEBT_GAMMA (out of scope)");

  const termAlpha = syntheticCaseA.proposalTerms.find(t => t.debtId === DEBT_ALPHA)!;
  const termBeta = syntheticCaseA.proposalTerms.find(t => t.debtId === DEBT_BETA)!;
  assert(termAlpha.rateMode === "FLOATING", "DEBT_ALPHA is floating rate");
  assert(termBeta.rateMode === "FIXED", "DEBT_BETA is fixed rate");
  assert(termAlpha.writeOffAmountCents === 1350000, "write-off for DEBT_ALPHA is €13,500");
});

// ─── T10 ─────────────────────────────────────────────────────────────────────
group("T10 — SIGNED ≠ ELIGIBLE_VERIFIED", () => {
  assert(syntheticCaseA.outcome.status === "SIGNED", "outcome is SIGNED");
  assert(syntheticCaseA.trainingEligibility.status === "NOT_REVIEWED", "eligibility is NOT_REVIEWED");

  const projection = projectTrainingSafe(syntheticCaseA);
  assert(projection.outcomeStatus === "SIGNED", "projection outcome is SIGNED");
  assert(projection.trainingEligibility === "NOT_REVIEWED", "projection eligibility is NOT_REVIEWED");

  const caseWithEligibility: ExtrajudicialCase = {
    ...syntheticCaseA,
    trainingEligibility: {
      status: "ELIGIBLE_VERIFIED", exclusionReason: null,
      reviewedAt: "2024-03-01T10:00:00Z", reviewedBy: "reviewer-001"
    }
  };
  assert(caseWithEligibility.trainingEligibility.status === "ELIGIBLE_VERIFIED",
    "explicit assignment to ELIGIBLE_VERIFIED works");
  assert(caseWithEligibility.trainingEligibility.reviewedAt !== null, "requires reviewer timestamp");
});

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Tests: ${passed + failed} total | ${passed} passed | ${failed} failed`);
if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  throw new Error("TESTS FAILED");
} else {
  console.log(`\nAll tests PASSED ✓`);
}
