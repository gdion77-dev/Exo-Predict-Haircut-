/**
 * ExoPredict PRO — Assembly & Repository Tests (Step 4)
 *
 * A01 - assembleCase: produces valid ExtrajudicialCase with correct structure
 * A02 - 5 debts, all from PDF, contract numbers as strings
 * A03 - 2 properties (deduplicated from 4 asset rows)
 * A04 - 4 ownerships (2 per property × 2 owners)
 * A05 - 3 collateral links (after dedup of 5 raw rows)
 * A06 - 3 secured debts covered by collateral, 2 unsecured not
 * A07 - Income dedup: 3 raw rows → 2 records (Σύζυγος/Συνοφειλέτης same ΑΦΜ+year)
 * A08 - Income history included with cross-source dedup
 * A09 - Outcome = PROPOSAL_ISSUED, trainingEligibility = NOT_REVIEWED
 * A10 - Training-safe projection contains no PII
 * A11 - Repository: add, get, count, stats
 * A12 - exportTrainingSafeDataset returns empty when no ELIGIBLE_VERIFIED
 * A13 - After setTrainingEligibility → exportTrainingSafeDataset returns 1 case
 * A14 - exportAllProjections returns all cases regardless of eligibility
 * A15 - Validation: no blockers on assembled case
 */

import { assembleCase } from "../../../src/domain/exopredict/assembly/caseAssembler";
import { InMemoryCaseRepository } from "../../../src/domain/exopredict/repository/inMemoryCaseRepository";
import { projectTrainingSafe } from "../../../src/domain/exopredict/types/projection";
import { realCaseAssemblyInput } from "../../../src/domain/exopredict/fixtures/realCaseAssemblyInput";
import { makeCaseId } from "../../../src/domain/exopredict/types/primitives";

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

// Assemble once — all tests share this result
const result = assembleCase(realCaseAssemblyInput);
const c = result.case;

// ─── A01: Valid case structure ────────────────────────────────────────────────
group("A01 — assembleCase produces valid ExtrajudicialCase", () => {
  assert(c.caseId === "CASE-443624", "caseId matches input");
  assert(c.status === "PROPOSAL_RECEIVED", "status is PROPOSAL_RECEIVED");
  assert(c.submissionDate === "2025-11-27", "submission date from PDF");
  assert(c.proposalOrContractDate === null, "no contract date (ΠΡΟΧΕΙΡΟ)");
  assert(c.sourceFileManifest.files.length === 6, "6 source files in manifest");
});

// ─── A02: 5 debts from PDF ────────────────────────────────────────────────────
group("A02 — 5 debts with correct contract numbers (strings)", () => {
  assert(c.debts.length === 5, "exactly 5 debts");
  assert(c.debts.every(d => typeof d.contractNumber === "string"), "all contractNumbers are strings");
  assert(c.debts.every(d => typeof d.debtIdentityRef === "string"), "all debtIdentityRefs are strings");
  const refs = c.debts.map(d => d.debtIdentityRef ?? "");
  assert(refs.includes("0407930211855"), "debt 0407930211855 present");
  assert(refs.includes("0407910211900"), "debt 0407910211900 present");
  assert(refs.includes("0407910211901"), "debt 0407910211901 present");
  assert(refs.includes("0407020211830"), "debt 0407020211830 present");
  assert(refs.includes("0407030211828"), "debt 0407030211828 present");
  assert(c.debts.every(d => d.creditorKey === "DOVALUE_GREECE"), "all creditorKey = DOVALUE_GREECE");
});

// ─── A03: 2 unique properties ─────────────────────────────────────────────────
group("A03 — 2 properties (deduplicated from 4 asset rows)", () => {
  assert(c.properties.length === 2, "exactly 2 property records");
  const propIds = c.properties.map(p => p.propertyId);
  assert(propIds.includes("PROP-73766" as typeof propIds[0]), "PROP-73766 present");
  assert(propIds.includes("PROP-90893" as typeof propIds[0]), "PROP-90893 present");
  assert(c.properties.every(p => p.propertyType === "UNKNOWN"), "type UNKNOWN (not inferred)");
  assert(c.properties.some(p => p.areaLabel?.includes("ΣΑΜΟΥ")), "area label includes ΣΑΜΟΥ");
});

// ─── A04: 4 ownerships ────────────────────────────────────────────────────────
group("A04 — 4 ownerships (2 per property × 2 persons)", () => {
  assert(c.propertyOwnerships.length === 4, "exactly 4 ownership records");
  // Each property has 2 owners
  const prop73766Ownerships = c.propertyOwnerships.filter(o => o.propertyId === "PROP-73766");
  const prop90893Ownerships = c.propertyOwnerships.filter(o => o.propertyId === "PROP-90893");
  assert(prop73766Ownerships.length === 2, "2 ownerships for PROP-73766");
  assert(prop90893Ownerships.length === 2, "2 ownerships for PROP-90893");
  // Ownership percentage null (not specified in source)
  assert(c.propertyOwnerships.every(o => o.ownershipPercentage === null),
    "ownership % null (not specified in source)");
});

// ─── A05: 3 unique collateral links ───────────────────────────────────────────
group("A05 — 3 collateral links (5 rows, 2 duplicates removed)", () => {
  assert(c.collateralLinks.length === 3, "exactly 3 collateral links (2 dupes removed)");
  const codes = c.collateralLinks.map(l => l.collateralId);
  assert(codes.includes("COL-00280001" as typeof codes[0]), "COL-00280001 present");
  assert(codes.includes("COL-00240369" as typeof codes[0]), "COL-00240369 present");
  assert(codes.includes("COL-00258789" as typeof codes[0]), "COL-00258789 present");
});

// ─── A06: Secured/unsecured debt assignment ────────────────────────────────────
group("A06 — Secured debts in collateral links, unsecured excluded", () => {
  const securedDebtRefs = ["0407930211855", "0407910211900", "0407910211901"];
  const unsecuredDebtRefs = ["0407020211830", "0407030211828"];

  const securedIds = c.debts
    .filter(d => securedDebtRefs.includes(d.debtIdentityRef ?? ""))
    .map(d => d.debtId);
  const unsecuredIds = c.debts
    .filter(d => unsecuredDebtRefs.includes(d.debtIdentityRef ?? ""))
    .map(d => d.debtId);

  const allCoveredIds = new Set(c.collateralLinks.flatMap(l => Array.from(l.coveredDebtIds)));

  assert(securedIds.every(id => allCoveredIds.has(id)), "all 3 secured debts in collateral");
  assert(!unsecuredIds.some(id => allCoveredIds.has(id)), "unsecured debts NOT in collateral");
});

// ─── A07: Income dedup ────────────────────────────────────────────────────────
group("A07 — Income dedup: Σύζυγος+Συνοφειλέτης same ΑΦΜ+year → 1 record", () => {
  // incomeRows has 3 rows: applicant(2024), codebt-as-spouse(2024), codebt-as-codebt(2024)
  // After dedup: 2 records (applicant 2024, codebt 2024)
  const income2024 = c.incomes.filter(i => i.taxYear === 2024);
  assert(income2024.length === 2, "2 income records for 2024 (not 3)");
  const applicantIncome = income2024.find(i => i.netAmountCents === 775200);
  const coDebtIncome = income2024.find(i => i.netAmountCents === 13707);
  assert(applicantIncome !== undefined, "applicant income €7.752,00 → 775200 cents");
  assert(coDebtIncome !== undefined, "co-debtor income €137,07 → 13707 cents");
});

// ─── A08: Income history cross-dedup ──────────────────────────────────────────
group("A08 — Income history: 2023 records included without cross-duplication", () => {
  const income2023 = c.incomes.filter(i => i.taxYear === 2023);
  assert(income2023.length === 2, "2 income records for 2023 (applicant + codebt)");
  const income2022 = c.incomes.filter(i => i.taxYear === 2022);
  assert(income2022.length === 2, "2 income records for 2022");
});

// ─── A09: Outcome and eligibility ─────────────────────────────────────────────
group("A09 — Outcome PROPOSAL_ISSUED, eligibility NOT_REVIEWED", () => {
  assert(c.outcome.status === "PROPOSAL_ISSUED", "outcome = PROPOSAL_ISSUED");
  assert(c.outcome.signedDate === null, "no signed date (ΠΡΟΧΕΙΡΟ)");
  assert(c.trainingEligibility.status === "NOT_REVIEWED", "eligibility = NOT_REVIEWED");
  assert(c.trainingEligibility.reviewedAt === null, "not yet reviewed");
});

// ─── A10: Training-safe projection has no PII ─────────────────────────────────
group("A10 — Training-safe projection contains no PII", () => {
  const projection = projectTrainingSafe(c);
  const projStr = JSON.stringify(projection);
  assert(!projStr.includes("020909350"), "applicant ΑΦΜ not in projection");
  assert(!projStr.includes("041551914"), "co-debtor ΑΦΜ not in projection");
  assert(!projStr.includes("privateIdentity"), "no privateIdentity");
  assert(!projStr.includes("contractNumber"), "no contractNumber");
  assert(!projStr.includes("00000000003690018856"), "no raw contract number");
  assert(projection.householdSize === 2, "household size preserved");
  assert(projection.spouseOrPartnerPresent === true, "spouse flag preserved");
  assert(projection.debts.length === 5, "5 anonymous debt summaries");
  assert(projection.properties.length === 2, "2 anonymous property summaries");
  assert(projection.proposalTerms.length === 5, "5 proposal term summaries");
  assert(projection.outcomeStatus === "PROPOSAL_ISSUED", "outcome status preserved");
  assert(projection.trainingEligibility === "NOT_REVIEWED", "eligibility preserved");
});

// ─── A11: Repository add/get/count ────────────────────────────────────────────
group("A11 — Repository: add, get, count, stats", () => {
  const repo = new InMemoryCaseRepository();
  assert(repo.count() === 0, "empty repo starts at 0");

  const added = repo.add(c);
  assert(added === true, "add returns true on first add");
  assert(repo.count() === 1, "count is 1 after add");

  const addAgain = repo.add(c);
  assert(addAgain === false, "add returns false if case already exists");

  const retrieved = repo.get(makeCaseId("CASE-443624"));
  assert(retrieved !== null, "get returns case");
  assert(retrieved?.caseId === "CASE-443624", "retrieved case has correct id");

  const missing = repo.get(makeCaseId("CASE-NONEXISTENT"));
  assert(missing === null, "get returns null for unknown case");

  const stats = repo.stats();
  assert(stats.total === 1, "stats.total = 1");
  assert(stats.byOutcomeStatus["PROPOSAL_ISSUED"] === 1, "stats byOutcome PROPOSAL_ISSUED = 1");
  assert(stats.eligibleVerifiedCount === 0, "no ELIGIBLE_VERIFIED yet");
});

// ─── A12: exportTrainingSafeDataset empty when not reviewed ───────────────────
group("A12 — exportTrainingSafeDataset empty when no ELIGIBLE_VERIFIED", () => {
  const repo = new InMemoryCaseRepository();
  repo.add(c);
  const dataset = repo.exportTrainingSafeDataset();
  assert(dataset.length === 0, "no cases in training dataset (none ELIGIBLE_VERIFIED)");
});

// ─── A13: After setTrainingEligibility → dataset has 1 case ──────────────────
group("A13 — setTrainingEligibility → exportTrainingSafeDataset returns 1 case", () => {
  const repo = new InMemoryCaseRepository();
  repo.add(c);

  const set = repo.setTrainingEligibility(
    makeCaseId("CASE-443624"),
    "ELIGIBLE_VERIFIED",
    "reviewer-001",
    null,
  );
  assert(set === true, "setTrainingEligibility returns true");

  const dataset = repo.exportTrainingSafeDataset();
  assert(dataset.length === 1, "1 case in training dataset");
  assert(dataset[0]?.trainingEligibility === "ELIGIBLE_VERIFIED", "dataset entry is ELIGIBLE_VERIFIED");

  // Verify PII not in exported JSON
  const json = repo.exportTrainingSafeDatasetJson();
  assert(!json.includes("020909350"), "no ΑΦΜ in exported dataset JSON");
  assert(!json.includes("contractNumber"), "no contractNumber in dataset JSON");
});

// ─── A14: exportAllProjections returns all regardless of eligibility ───────────
group("A14 — exportAllProjections returns all cases", () => {
  const repo = new InMemoryCaseRepository();
  repo.add(c);
  // Eligibility is NOT_REVIEWED — still appears in exportAllProjections
  const all = repo.exportAllProjections();
  assert(all.length === 1, "1 projection in exportAll");
  assert(all[0]?.trainingEligibility === "NOT_REVIEWED", "projection shows NOT_REVIEWED");
});

// ─── A15: Validation no blockers ──────────────────────────────────────────────
group("A15 — Validation: no blockers on assembled real case", () => {
  assert(result.validationResult.hasBlockers === false, "no blockers");
  // We expect warnings (missing market value, null income, etc.)
  assert(result.validationResult.hasWarnings === true, "warnings present (expected)");
  const blockers = result.validationResult.issues.filter(i => i.severity === "BLOCKER");
  assert(blockers.length === 0, "zero blocker issues");
});

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Tests: ${passed + failed} total | ${passed} passed | ${failed} failed`);
if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  throw new Error("TESTS FAILED");
} else {
  console.log(`\nAll assembly tests PASSED ✓`);
}
