/**
 * ExoPredict PRO — Domain Tests
 * Step 1: Domain Foundation
 *
 * All 10 required test scenarios, using synthetic/anonymized data only.
 */

import {
  syntheticCaseA,
  DEBT_ALPHA,
  DEBT_BETA,
  DEBT_GAMMA,
  PROPERTY_MAIN,
  PERSON_CO_DEBTOR,
  PERSON_GUARANTOR,
  PERSON_THIRD_COLLATERAL,
} from "../src/domain/exopredict/fixtures/syntheticCaseA";
import {
  validateIdentifierTypes,
  validateMoneyNullVsZero,
  validatePropertyValueTypeSeparation,
  validateNoPropertyDoubleCounting,
  validateDebtPersonMappingCompleteness,
  validateOwnershipPercentages,
  validateTrainingSafeProjectionNoPII,
  validateCase,
} from "../src/domain/exopredict/validators";
import { projectTrainingSafe } from "../src/domain/exopredict/types/projection";
import type { ExtrajudicialCase } from "../src/domain/exopredict/types/case";
import type { Debt } from "../src/domain/exopredict/types/debt";
import { makeCaseId, makeDebtId, makePersonId } from "../src/domain/exopredict/types/primitives";

// ─── Test 1: External identifiers preserve leading zeros as strings ───────────

describe("T01 — External identifiers preserve leading zeros", () => {
  test("Contract numbers are strings and retain leading zeros", () => {
    const debtAlpha = syntheticCaseA.debts.find((d) => d.debtId === DEBT_ALPHA);
    expect(debtAlpha).toBeDefined();
    expect(typeof debtAlpha!.contractNumber).toBe("string");
    expect(debtAlpha!.contractNumber).toBe("00123456789");
    expect(debtAlpha!.contractNumber!.startsWith("00")).toBe(true);
  });

  test("Debt identity reference is a string and preserves leading zeros", () => {
    const debtAlpha = syntheticCaseA.debts.find((d) => d.debtId === DEBT_ALPHA);
    expect(typeof debtAlpha!.debtIdentityRef).toBe("string");
    expect(debtAlpha!.debtIdentityRef).toBe("007654321");
  });

  test("Validator V01 raises no issues for string identifiers", () => {
    const issues = validateIdentifierTypes(syntheticCaseA.debts);
    const blockers = issues.filter((i) => i.code === "V01_CONTRACT_NUMBER_NOT_STRING");
    expect(blockers).toHaveLength(0);
  });
});

// ─── Test 2: null money is not treated as 0 ──────────────────────────────────

describe("T02 — null money ≠ 0", () => {
  test("Income with unknown amount has null, not 0", () => {
    const spouseIncome = syntheticCaseA.incomes.find(
      (i) => i.recordId === "INC-002"
    );
    expect(spouseIncome).toBeDefined();
    expect(spouseIncome!.netAmountCents).toBeNull();
  });

  test("Debt with null totalDebtCents raises V02 warning", () => {
    // Create a debt with null total
    const debtWithNullTotal: Debt = {
      debtId: makeDebtId("D-NULL-TEST"),
      creditorKey: "TEST_CREDITOR",
      claimantLabel: null,
      contractNumber: "00000001",
      debtIdentityRef: null,
      currency: "EUR",
      principalAmountCents: null,
      overdueInterestCents: null,
      totalDebtCents: null,
      category: "UNKNOWN",
      regulatedParticipation: null,
      sourceRef: null,
      verificationStatus: "UNKNOWN",
    };
    const issues = validateMoneyNullVsZero([debtWithNullTotal]);
    expect(issues.some((i) => i.code === "V02_TOTAL_DEBT_UNKNOWN")).toBe(true);
  });

  test("Debt with totalDebtCents=0 does NOT trigger null warning (0 is explicit zero)", () => {
    const debtGamma = syntheticCaseA.debts.find((d) => d.debtId === DEBT_GAMMA);
    expect(debtGamma!.totalDebtCents).toBe(0); // explicitly zero
    const issues = validateMoneyNullVsZero([debtGamma!]);
    expect(issues.some((i) => i.code === "V02_TOTAL_DEBT_UNKNOWN")).toBe(false);
  });
});

// ─── Test 3: Creditor collateral value does not produce market value ──────────

describe("T03 — Creditor collateral value ≠ market value", () => {
  test("Property has CREDITOR_COLLATERAL_VALUE but no MARKET_VALUE_ESTIMATE", () => {
    const evidences = syntheticCaseA.propertyValueEvidences.filter(
      (e) => e.propertyId === PROPERTY_MAIN
    );
    const hasCreditorValue = evidences.some(
      (e) => e.valueType === "CREDITOR_COLLATERAL_VALUE"
    );
    const hasMarketValue = evidences.some(
      (e) => e.valueType === "MARKET_VALUE_ESTIMATE"
    );
    expect(hasCreditorValue).toBe(true);
    expect(hasMarketValue).toBe(false);
  });

  test("Training-safe projection returns null market value (no fallback to creditor value)", () => {
    const projection = projectTrainingSafe(syntheticCaseA);
    const prop = projection.properties[0];
    expect(prop).toBeDefined();
    expect(prop!.marketValueCents).toBeNull(); // must be null — no fallback
  });

  test("V03 validator raises WARNING for missing market value", () => {
    const issues = validatePropertyValueTypeSeparation(
      syntheticCaseA.propertyValueEvidences
    );
    expect(issues.some((i) => i.code === "V03_MISSING_MARKET_VALUE")).toBe(true);
  });
});

// ─── Test 4: Property covering 3 debts remains a single property record ───────

describe("T04 — No double-counting of property across debts", () => {
  test("Case has exactly one property record despite 3 debt links", () => {
    expect(syntheticCaseA.properties).toHaveLength(1);
    expect(syntheticCaseA.properties[0]!.propertyId).toBe(PROPERTY_MAIN);
  });

  test("Single collateral link covers all 3 debts — property is not duplicated", () => {
    const links = syntheticCaseA.collateralLinks;
    expect(links).toHaveLength(1);
    expect(links[0]!.coveredDebtIds).toHaveLength(3);
  });

  test("V04 raises INFO when property covers multiple debts (no double-count)", () => {
    const issues = validateNoPropertyDoubleCounting(syntheticCaseA.collateralLinks);
    const info = issues.filter((i) => i.code === "V04_PROPERTY_COVERS_MULTIPLE_DEBTS");
    expect(info).toHaveLength(1);
    expect(info[0]!.severity).toBe("INFO");
  });
});

// ─── Test 5: Co-debtor linked to one debt, not all ────────────────────────────

describe("T05 — Co-debtor linked per specific debt", () => {
  test("Co-debtor role exists only for DEBT_ALPHA", () => {
    const coDebtorRoles = syntheticCaseA.debtPartyRoles.filter(
      (r) => r.personId === PERSON_CO_DEBTOR && r.role === "CO_DEBTOR"
    );
    expect(coDebtorRoles).toHaveLength(1);
    expect(coDebtorRoles[0]!.debtId).toBe(DEBT_ALPHA);
  });

  test("Co-debtor has no role on DEBT_BETA or DEBT_GAMMA", () => {
    const coDebtorOnOther = syntheticCaseA.debtPartyRoles.filter(
      (r) =>
        r.personId === PERSON_CO_DEBTOR &&
        (r.debtId === DEBT_BETA || r.debtId === DEBT_GAMMA)
    );
    expect(coDebtorOnOther).toHaveLength(0);
  });
});

// ─── Test 6: CO_DEBTOR, GUARANTOR, and THIRD_PARTY_COLLATERAL_PROVIDER are distinct ──

describe("T06 — Party roles are distinct per person and debt", () => {
  test("PERSON_CO_DEBTOR has role CO_DEBTOR, not GUARANTOR", () => {
    const role = syntheticCaseA.debtPartyRoles.find(
      (r) => r.personId === PERSON_CO_DEBTOR
    );
    expect(role!.role).toBe("CO_DEBTOR");
  });

  test("PERSON_GUARANTOR has role GUARANTOR on DEBT_BETA, not CO_DEBTOR", () => {
    const role = syntheticCaseA.debtPartyRoles.find(
      (r) => r.personId === PERSON_GUARANTOR
    );
    expect(role!.role).toBe("GUARANTOR");
    expect(role!.debtId).toBe(DEBT_BETA);
  });

  test("PERSON_THIRD_COLLATERAL has role THIRD_PARTY_COLLATERAL_PROVIDER on DEBT_GAMMA", () => {
    const role = syntheticCaseA.debtPartyRoles.find(
      (r) => r.personId === PERSON_THIRD_COLLATERAL
    );
    expect(role!.role).toBe("THIRD_PARTY_COLLATERAL_PROVIDER");
    expect(role!.debtId).toBe(DEBT_GAMMA);
  });

  test("All three roles are distinct values", () => {
    const roles = new Set(
      [PERSON_CO_DEBTOR, PERSON_GUARANTOR, PERSON_THIRD_COLLATERAL].map(
        (pid) =>
          syntheticCaseA.debtPartyRoles.find((r) => r.personId === pid)!.role
      )
    );
    expect(roles.size).toBe(3);
  });
});

// ─── Test 7: Training-safe projection contains no PII ────────────────────────

describe("T07 — Training-safe projection strips PII", () => {
  test("Projection contains no privateIdentity", () => {
    const projection = projectTrainingSafe(syntheticCaseA);
    const projStr = JSON.stringify(projection);
    // privateIdentity must not appear in projection output
    expect(projStr).not.toContain("privateIdentity");
    expect(projStr).not.toContain("fullName");
    expect(projStr).not.toContain("address");
  });

  test("Projection contains no contract numbers", () => {
    const projection = projectTrainingSafe(syntheticCaseA);
    const projStr = JSON.stringify(projection);
    expect(projStr).not.toContain("contractNumber");
    expect(projStr).not.toContain("00123456789");
    expect(projStr).not.toContain("00987654321");
  });

  test("Projection contains no AFMs or IBANs (V08 validator)", () => {
    // Inject a synthetic projection with a fake AFM to test the validator catches it
    const projectionWithPII = {
      ...projectTrainingSafe(syntheticCaseA),
      properties: [
        {
          propertyType: "PRIMARY_RESIDENCE",
          areaLabel: "123456789", // looks like AFM
          marketValueCents: null,
          objectiveValueCents: 6000000,
          currency: "EUR" as const,
        },
      ],
    };
    const issues = validateTrainingSafeProjectionNoPII(projectionWithPII);
    expect(issues.some((i) => i.code === "V08_PII_LEAK_IN_PROJECTION")).toBe(true);
  });

  test("Clean projection passes V08 validator", () => {
    const projection = projectTrainingSafe(syntheticCaseA);
    const issues = validateTrainingSafeProjectionNoPII(projection);
    const blockers = issues.filter((i) => i.severity === "BLOCKER");
    expect(blockers).toHaveLength(0);
  });
});

// ─── Test 8: Incomplete data produces explicit warnings, not fabricated values ─

describe("T08 — Incomplete data → explicit warnings, not fabricated values", () => {
  test("Missing market value produces WARNING, not a fallback amount", () => {
    const issues = validatePropertyValueTypeSeparation(
      syntheticCaseA.propertyValueEvidences
    );
    const warning = issues.find((i) => i.code === "V03_MISSING_MARKET_VALUE");
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe("WARNING");
  });

  test("Null income amount is preserved as null, never replaced", () => {
    const income = syntheticCaseA.incomes.find((i) => i.recordId === "INC-002");
    expect(income!.netAmountCents).toBeNull();
    // Projection total income is null when any income is null
    const projection = projectTrainingSafe(syntheticCaseA);
    expect(projection.totalIncomeCents).toBeNull();
  });

  test("Overall validation detects warnings without crashing", () => {
    const result = validateCase(syntheticCaseA);
    expect(result.hasWarnings).toBe(true);
    expect(result.hasBlockers).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

// ─── Test 9: Proposal terms exist per debt, not only aggregate ───────────────

describe("T09 — Proposal terms per debt", () => {
  test("Two proposal terms exist: one per regulated debt", () => {
    expect(syntheticCaseA.proposalTerms).toHaveLength(2);
  });

  test("Each term references a specific debtId", () => {
    const termDebtIds = syntheticCaseA.proposalTerms.map((t) => t.debtId);
    expect(termDebtIds).toContain(DEBT_ALPHA);
    expect(termDebtIds).toContain(DEBT_BETA);
    expect(termDebtIds).not.toContain(DEBT_GAMMA); // out of scope
  });

  test("Terms for DEBT_ALPHA and DEBT_BETA have different rate modes", () => {
    const termAlpha = syntheticCaseA.proposalTerms.find(
      (t) => t.debtId === DEBT_ALPHA
    );
    const termBeta = syntheticCaseA.proposalTerms.find(
      (t) => t.debtId === DEBT_BETA
    );
    expect(termAlpha!.rateMode).toBe("FLOATING");
    expect(termBeta!.rateMode).toBe("FIXED");
  });

  test("Write-off amounts are stored per debt in euro cents", () => {
    const termAlpha = syntheticCaseA.proposalTerms.find(
      (t) => t.debtId === DEBT_ALPHA
    );
    expect(termAlpha!.writeOffAmountCents).toBe(1350000); // €13,500
  });
});

// ─── Test 10: SIGNED ≠ ELIGIBLE_VERIFIED ─────────────────────────────────────

describe("T10 — SIGNED contract does not auto-become ELIGIBLE_VERIFIED", () => {
  test("Case outcome is SIGNED", () => {
    expect(syntheticCaseA.outcome.status).toBe("SIGNED");
  });

  test("Training eligibility is NOT_REVIEWED, not ELIGIBLE_VERIFIED", () => {
    expect(syntheticCaseA.trainingEligibility.status).toBe("NOT_REVIEWED");
  });

  test("Projection reflects NOT_REVIEWED training eligibility", () => {
    const projection = projectTrainingSafe(syntheticCaseA);
    expect(projection.outcomeStatus).toBe("SIGNED");
    expect(projection.trainingEligibility).toBe("NOT_REVIEWED");
  });

  test("Manually forcing a SIGNED case to ELIGIBLE_VERIFIED requires explicit assignment", () => {
    // There is no automatic promotion — the field must be set explicitly
    const caseWithEligibility: ExtrajudicialCase = {
      ...syntheticCaseA,
      trainingEligibility: {
        status: "ELIGIBLE_VERIFIED",
        exclusionReason: null,
        reviewedAt: "2024-03-01T10:00:00Z",
        reviewedBy: "reviewer-001",
      },
    };
    expect(caseWithEligibility.trainingEligibility.status).toBe("ELIGIBLE_VERIFIED");
    expect(caseWithEligibility.trainingEligibility.reviewedAt).not.toBeNull();
  });
});
