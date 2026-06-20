/**
 * ExoPredict PRO — PDF Parser Tests (Step 3)
 * Node.js standalone runner.
 *
 * Tests cover:
 * P01 - parseContractPdfData: 5 debt rows from Π5, all fields correct
 * P02 - Contract numbers always strings with leading zeros
 * P03 - Debt identity refs always strings
 * P04 - Money: principal + overdue interest in cents, null-safe
 * P05 - Co-debtor linked to exactly 2 debts (Π7), NOT all 5
 * P06 - Proposal terms: 5 rows from Π8, one per debt
 * P07 - Write-off of 0 stored as 0, not null (explicit zero)
 * P08 - Spread 300bp = secured, 400bp = unsecured — stored as flag
 * P09 - Monthly installments from Παράρτημα Ι, one per debt
 * P10 - CollateralLink.coveredDebtIds populated with secured debts only
 * P11 - Unsecured debts NOT in any collateral link
 * P12 - buildDebtsFromParsedContract: primary debtor on all debts, co-debtor on 2 only
 */

import { parseContractPdfData, buildDebtsFromParsedContract } from
  "../../../src/domain/exopredict/importers/pdf/contractPdfParser";
import { makePersonId, makeCollateralId, makePropertyId } from
  "../../../src/domain/exopredict/types/primitives";
import type { CollateralLink } from
  "../../../src/domain/exopredict/types/property";

const NOW = "2026-06-20T00:00:00Z";
const FILENAME = "debt_restructure_contract.pdf";

const personMap = new Map([
  ["020909350", makePersonId("P-APPLICANT")],
  ["041551914", makePersonId("P-CODEBT")],
]);

// Synthetic collateral links from Step 2 (empty coveredDebtIds)
const syntheticCollateralLinks: CollateralLink[] = [
  {
    collateralId: makeCollateralId("COL-00240369"),
    propertyId: makePropertyId("PROP-73766"),
    coveredDebtIds: [],
    registrationPriority: 1,
    sourceRef: null,
    verificationStatus: "VERIFIED_AGAINST_SOURCE",
  },
  {
    collateralId: makeCollateralId("COL-00280001"),
    propertyId: makePropertyId("PROP-90893"),
    coveredDebtIds: [],
    registrationPriority: 2,
    sourceRef: null,
    verificationStatus: "VERIFIED_AGAINST_SOURCE",
  },
];

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string): void {
  if (condition) { console.log(`  ✓ ${name}`); passed++; }
  else { console.error(`  ✗ FAIL: ${name}`); failed++; }
}

function group(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

const parsed = parseContractPdfData(FILENAME, NOW);
const built = buildDebtsFromParsedContract(parsed, "020909350", personMap, syntheticCollateralLinks, FILENAME, NOW);

// ─── P01: 5 debt rows ────────────────────────────────────────────────────────
group("P01 — 5 debt rows from Πίνακας 5", () => {
  assert(parsed.debtRows.length === 5, "exactly 5 debt rows");
  assert(parsed.debtRows.every(r => r.isRegulated === true), "all debts are regulated");
  assert(parsed.debtRows.every(r => r.creditorAfm === "099755919"), "all from doValue Greece");
  assert(parsed.debtRows.every(r => r.claimantLabel === "XYQ Luxco S.à r.l."), "all beneficiary XYQ");
});

// ─── P02: Contract numbers as strings with leading zeros ─────────────────────
group("P02 — Contract numbers: strings with leading zeros", () => {
  const contracts = parsed.debtRows.map(r => r.contractNumber);
  assert(contracts.every(c => typeof c === "string"), "all strings");
  assert(contracts.some(c => c.startsWith("000000000036")), "starts with leading zeros");
  assert(contracts.some(c => c === "00000000003690018856"), "0018856 contract preserved");
  assert(contracts.some(c => c === "00000000004253343627_1"), "suffix _1 preserved");
  assert(contracts.every(c => !c.includes(" ")), "no whitespace in contract numbers");
});

// ─── P03: Debt identity refs as strings ──────────────────────────────────────
group("P03 — Debt identity refs: always strings", () => {
  const refs = parsed.debtRows.map(r => r.debtIdentityRef);
  assert(refs.every(r => typeof r === "string"), "all strings");
  assert(refs.includes("0407030211828"), "0407030211828 present");
  assert(refs.includes("0407930211855"), "0407930211855 present");
  assert(refs.includes("0407020211830"), "0407020211830 present");
  assert(refs.includes("0407910211900"), "0407910211900 present");
  assert(refs.includes("0407910211901"), "0407910211901 present");
});

// ─── P04: Money in cents, null-safe ──────────────────────────────────────────
group("P04 — Money: integer cents, null-safe", () => {
  const d1 = parsed.debtRows.find(r => r.debtIdentityRef === "0407930211855")!;
  assert(d1.principalCents === 10925266, "principal 109.252,66 → 10925266 cents");
  assert(d1.overdueInterestCents === 638570, "overdue 6.385,70 → 638570 cents");
  assert(d1.totalDebtCents === 11563836, "total 115.638,36 → 11563836 cents");

  const d2 = parsed.debtRows.find(r => r.debtIdentityRef === "0407030211828")!;
  assert(d2.principalCents === 1138505, "principal 11.385,05 → 1138505");
  assert(d2.overdueInterestCents === 2934, "overdue 29,34 → 2934");
  assert(d2.totalDebtCents === 1141439, "total 11.414,39 → 1141439");
  assert(typeof d2.principalCents === "number", "cents are numbers not strings");
});

// ─── P05: Co-debtor in exactly 2 debts ───────────────────────────────────────
group("P05 — Co-debtor linked to 2 debts only (Πίνακας 7)", () => {
  assert(parsed.coDebtorRows.length === 1, "1 co-debtor in Π6");
  assert(parsed.coDebtorDebtRows.length === 2, "co-debtor linked to exactly 2 debts");
  const coDebtIds = parsed.coDebtorDebtRows.map(r => r.debtIdentityRef);
  assert(coDebtIds.includes("0407910211901"), "co-debtor on 0407910211901");
  assert(coDebtIds.includes("0407930211855"), "co-debtor on 0407930211855");
  assert(!coDebtIds.includes("0407030211828"), "NOT on 0407030211828");
  assert(!coDebtIds.includes("0407020211830"), "NOT on 0407020211830");
  assert(!coDebtIds.includes("0407910211900"), "NOT on 0407910211900");
});

// ─── P06: 5 proposal term rows ───────────────────────────────────────────────
group("P06 — 5 proposal term rows (Πίνακας 8)", () => {
  assert(parsed.restructuringTermRows.length === 5, "exactly 5 term rows");
  const termRefs = parsed.restructuringTermRows.map(r => r.debtIdentityRef);
  assert(new Set(termRefs).size === 5, "all 5 unique debt identity refs");
});

// ─── P07: Write-off of 0 is explicit zero ────────────────────────────────────
group("P07 — Write-off €0,00 stored as 0, not null", () => {
  const term3 = parsed.restructuringTermRows.find(r => r.debtIdentityRef === "0407910211901")!;
  assert(term3.writeOffCents === 0, "€0,00 → 0 cents (not null)");
  assert(term3.writeOffCents !== null, "0 is NOT null");
  assert(term3.finalRegulatedCents === 2625908, "final 26.259,08 → 2625908");
});

// ─── P08: Spread 300bp secured, 400bp unsecured ──────────────────────────────
group("P08 — Spread basis points and secured flag", () => {
  const secured = parsed.restructuringTermRows.filter(r => r.spreadBasisPoints === 300);
  const unsecured = parsed.restructuringTermRows.filter(r => r.spreadBasisPoints === 400);
  assert(secured.length === 3, "3 secured debts (spread 300bp)");
  assert(unsecured.length === 2, "2 unsecured debts (spread 400bp)");
  assert(secured.every(r => r.isCollateralSecured === true), "all 300bp = isCollateralSecured true");
  assert(unsecured.every(r => r.isCollateralSecured === false), "all 400bp = isCollateralSecured false");
});

// ─── P09: Monthly installments from Παράρτημα Ι ──────────────────────────────
group("P09 — Monthly installments from Παράρτημα Ι", () => {
  assert(parsed.installmentSchedule.length === 5, "5 installment entries (one per debt)");
  const i1 = parsed.installmentSchedule.find(e => e.debtIdentityRef === "0407930211855")!;
  assert(i1.monthlyAmountCents === 60425, "€604,25 → 60425 cents");
  assert(i1.annualAmountCents === 725100, "€7.251,00 → 725100 cents");

  const i2 = parsed.installmentSchedule.find(e => e.debtIdentityRef === "0407910211900")!;
  assert(i2.monthlyAmountCents === 28610, "€286,10 → 28610 cents");

  const i3 = parsed.installmentSchedule.find(e => e.debtIdentityRef === "0407030211828")!;
  assert(i3.monthlyAmountCents === 8255, "€82,55 → 8255 cents");

  const i4 = parsed.installmentSchedule.find(e => e.debtIdentityRef === "0407020211830")!;
  assert(i4.monthlyAmountCents === 1112, "€11,12 → 1112 cents");
});

// ─── P10: CollateralLink coveredDebtIds = secured debts only ─────────────────
group("P10 — CollateralLinks populated with secured debts only", () => {
  const updatedLinks = built.updatedCollateralLinks;
  assert(updatedLinks.length === 2, "2 collateral links (from Step 2)");
  const ids0 = updatedLinks[0]!.coveredDebtIds;
  const ids1 = updatedLinks[1]!.coveredDebtIds;
  assert(ids0.length === 3, "first link covers 3 secured debts");
  assert(ids1.length === 3, "second link covers 3 secured debts");
  // The 3 secured are: 0407930211855, 0407910211900, 0407910211901
  const securedRefs = ["0407930211855", "0407910211900", "0407910211901"];
  const builtDebtIds = built.debts.filter(d =>
    securedRefs.includes(d.debtIdentityRef ?? "")).map(d => d.debtId);
  assert(builtDebtIds.length === 3, "3 secured Debt objects created");
  // Compare as strings — coveredDebtIds are DebtId (branded string)
  const builtDebtIdStrings = builtDebtIds.map(String);
  assert(Array.from(ids0).every((id) => builtDebtIdStrings.includes(String(id))),
    "coveredDebtIds match secured debt IDs");
});

// ─── P11: Unsecured debts NOT in collateral ───────────────────────────────────
group("P11 — Unsecured debts not in any CollateralLink", () => {
  const unsecuredRefs = ["0407020211830", "0407030211828"];
  const unsecuredDebtIds = built.debts
    .filter(d => unsecuredRefs.includes(d.debtIdentityRef ?? ""))
    .map(d => d.debtId);
  assert(unsecuredDebtIds.length === 2, "2 unsecured Debt objects");

  for (const link of built.updatedCollateralLinks) {
    for (const uid of unsecuredDebtIds) {
      assert(!link.coveredDebtIds.includes(uid),
        `unsecured debt ${uid} not in collateral link`);
    }
  }
});

// ─── P12: Party roles ─────────────────────────────────────────────────────────
group("P12 — DebtPartyRoles: primary on all 5, co-debtor on 2 only", () => {
  const primaryRoles = built.debtPartyRoles.filter(r => r.role === "PRIMARY_DEBTOR");
  const coDebtorRoles = built.debtPartyRoles.filter(r => r.role === "CO_DEBTOR");
  assert(primaryRoles.length === 5, "primary debtor on all 5 debts");
  assert(coDebtorRoles.length === 2, "co-debtor on exactly 2 debts");
  assert(coDebtorRoles.every(r => r.signedContract === false),
    "co-debtor signedContract=false (not in Π2)");
  assert(coDebtorRoles.every(r => r.benefitsFromRestructuring === false),
    "co-debtor benefitsFromRestructuring=false (per §4)");

  const coDebtorDebtIds = coDebtorRoles.map(r => r.debtId);
  const debt1 = built.debts.find(d => d.debtIdentityRef === "0407910211901");
  const debt2 = built.debts.find(d => d.debtIdentityRef === "0407930211855");
  assert(coDebtorDebtIds.includes(debt1!.debtId), "co-debtor on 0407910211901");
  assert(coDebtorDebtIds.includes(debt2!.debtId), "co-debtor on 0407930211855");
});

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Tests: ${passed + failed} total | ${passed} passed | ${failed} failed`);
if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  throw new Error("TESTS FAILED");
} else {
  console.log(`\nAll PDF parser tests PASSED ✓`);
}
